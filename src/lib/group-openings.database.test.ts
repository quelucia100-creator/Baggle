// Isolated PostgreSQL tests: never connect to the hosted database.
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";

let db: PGlite;
const me = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const pending = "00000000-0000-0000-0000-000000000003";
const group = "00000000-0000-0000-0000-000000000010";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    CREATE TABLE public.friend_groups(id uuid PRIMARY KEY,name text);
    CREATE TABLE public.friend_group_members(group_id uuid,user_id uuid,status text);
    CREATE TABLE public.account_preferences(user_id uuid,username text);
    CREATE TABLE public.account_weekly_availability(user_id uuid,weekday smallint,busy_slots smallint[],confirmed boolean);
    GRANT SELECT ON public.account_weekly_availability TO authenticated;
    ALTER TABLE public.account_weekly_availability ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_schedule ON public.account_weekly_availability TO authenticated USING(user_id=auth.uid());
    CREATE TABLE public.notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,kind text,actor_username text,detail text);
  `);
  await db.exec(await readFile(new URL("../../drizzle/migrations/0022_private_group_weekly_openings_and_pokes.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE public.group_hangout_pokes,public.friend_groups,public.friend_group_members,public.account_preferences,public.account_weekly_availability,public.notifications;
    INSERT INTO public.friend_groups VALUES('${group}','Study crew');
    INSERT INTO public.friend_group_members VALUES('${group}','${me}','member'),('${group}','${other}','member'),('${group}','${pending}','invited');
    INSERT INTO public.account_preferences VALUES('${me}','Alex'),('${other}','Lucia');
    INSERT INTO public.account_weekly_availability SELECT '${me}',1,array_agg(s)::smallint[],true FROM generate_series(0,59) s WHERE s NOT BETWEEN 32 AND 35;
    INSERT INTO public.account_weekly_availability SELECT '${other}',1,array_agg(s)::smallint[],true FROM generate_series(0,59) s WHERE s NOT BETWEEN 34 AND 37;
    SELECT set_config('request.jwt.claim.sub','${me}',false); SET ROLE authenticated;
  `);
});

async function action(action: string, weekday: number | null = null) {
  const result = await db.query<{ result: Record<string, unknown> }>("SELECT public.group_weekly_action($1,$2,$3) AS result", [action, group, weekday]);
  const row = result.rows[0];
  if (!row) throw new Error("Missing result");
  return row.result;
}

it("returns only times shared by all accepted members, not private schedules or pending invitees", async () => {
  expect(await action("read")).toEqual({ ok: true, openings: [{ weekday: 1, startSlot: 34, endSlot: 36 }], canPoke: true });
  const privateRows = await db.query<{ user_id: string }>("SELECT user_id FROM public.account_weekly_availability");
  expect(privateRows.rows.map((r) => r.user_id)).toEqual([me]);
});

it("does not assume missing weekday answers are free", async () => {
  await db.exec(`RESET ROLE; DELETE FROM public.account_weekly_availability WHERE user_id='${other}'; SET ROLE authenticated;`);
  expect((await action("read"))["openings"]).toEqual([]);
});

it("does not assume unconfirmed weekday answers are free", async () => {
  await db.exec(`RESET ROLE; UPDATE public.account_weekly_availability SET confirmed=false WHERE user_id='${other}'; SET ROLE authenticated;`);
  expect((await action("read"))["openings"]).toEqual([]);
});

it("requires at least two joined members before declaring everyone free", async () => {
  await db.exec(`RESET ROLE; DELETE FROM public.friend_group_members WHERE user_id='${other}'; SET ROLE authenticated;`);
  expect((await action("read"))["openings"]).toEqual([]);
});

it("preserves recurring Sunday next-day windows", async () => {
  await db.exec(`RESET ROLE; UPDATE public.account_weekly_availability SET weekday=7,busy_slots=ARRAY(SELECT s::smallint FROM generate_series(0,59) s WHERE s NOT BETWEEN 48 AND 49); SET ROLE authenticated;`);
  expect((await action("read"))["openings"]).toEqual([{ weekday: 7, startSlot: 48, endSlot: 50 }]);
});

it("denies pending invitees and outsiders both aggregate reads and pokes", async () => {
  for (const id of [pending, "00000000-0000-0000-0000-000000000099"]) {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    expect(await action("read")).toEqual({ ok: false, error: "not_allowed" });
    expect(await action("poke", 1)).toEqual({ ok: false, error: "not_allowed" });
  }
});

it("notifies every other joined member once and never pending invitees or the sender", async () => {
  expect(await action("poke", 1)).toEqual({ ok: true });
  await db.exec("RESET ROLE");
  const rows = await db.query("SELECT user_id,kind,actor_username,detail FROM public.notifications");
  expect(rows.rows).toEqual([{ user_id: other, kind: "group_poke", actor_username: "Alex", detail: "Study crew · Monday" }]);
  await db.exec("SET ROLE authenticated");
  expect(await action("poke", 1)).toEqual({ ok: false, error: "cooldown" });
  expect((await action("read"))["canPoke"]).toBe(false);
});

it("rechecks the shared weekday before sending any notification", async () => {
  expect(await action("poke", 2)).toEqual({ ok: false, error: "no_opening" });
  await db.exec(`RESET ROLE; UPDATE public.account_weekly_availability SET confirmed=false WHERE user_id='${other}'; SET ROLE authenticated;`);
  expect(await action("poke", 1)).toEqual({ ok: false, error: "no_opening" });
  await db.exec("RESET ROLE");
  expect((await db.query("SELECT * FROM public.notifications")).rows).toEqual([]);
});

it("denies anonymous execution and direct member access to poke tracking", async () => {
  await expect(db.query("SELECT * FROM public.group_hangout_pokes")).rejects.toThrow(/permission denied/);
  await db.exec("RESET ROLE; SET ROLE anon");
  await expect(action("read")).rejects.toThrow(/permission denied/);
});