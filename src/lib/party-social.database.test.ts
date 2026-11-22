// Isolated PostgreSQL only; never connects to the hosted database.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
let db: PGlite;
const host = "00000000-0000-0000-0000-000000000001";
const guest = "00000000-0000-0000-0000-000000000002";
const outsider = "00000000-0000-0000-0000-000000000003";
const hostToken = "a".repeat(64), guestToken = "b".repeat(64), thirdToken = "c".repeat(64);
const pid = "00000000-0000-0000-0000-000000000010";
const hostMember = "00000000-0000-0000-0000-000000000011";
const guestMember = "00000000-0000-0000-0000-000000000012";
const thirdMember = "00000000-0000-0000-0000-000000000013";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY);
    CREATE TABLE public.account_preferences(user_id uuid,username text,completed boolean);
    CREATE TABLE public.parties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE,journey_started boolean DEFAULT false,hangout jsonb,weather_cache jsonb,weather_cached_at timestamptz,weather_key text,event_state jsonb);
    CREATE TABLE public.party_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),party_id uuid,display_name text,token_hash text,is_host boolean DEFAULT false,removed boolean DEFAULT false,joined_at timestamptz DEFAULT now(),latitude double precision,longitude double precision,location_updated_at timestamptz,status_view boolean DEFAULT true);
    CREATE TABLE public.party_planning(party_id uuid,status text,revision integer DEFAULT 1,options jsonb DEFAULT '[]',participants uuid[] DEFAULT '{}',outliers uuid[] DEFAULT '{}',lock_id uuid,lock_snapshot jsonb,lock_started_at timestamptz,venue_source text);
    CREATE TABLE public.party_preferences(member_id uuid,confirmed boolean);
    CREATE TABLE public.party_preferences_v3(member_id uuid,submitted boolean);
    CREATE TABLE public.friendships(id uuid DEFAULT gen_random_uuid(),requester_id uuid,addressee_id uuid,status text DEFAULT 'pending');
    CREATE TABLE public.notifications(user_id uuid,kind text,actor_username text);
    CREATE FUNCTION public.party_host_ready(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
    CREATE FUNCTION public.party_planning_phase(uuid) RETURNS text LANGUAGE sql AS $$SELECT 'collecting'::text$$;
  `);
  const baseline = await readFile(`${process.cwd()}/drizzle/migrations/0030_host_first_planning.sql`, "utf8");
  const access = /CREATE OR REPLACE FUNCTION public\.party_access\([\s\S]*?\$\$;/.exec(baseline)?.[0];
  if (!access) throw new Error("Missing real party access baseline");
  await db.exec(access);
  const friendsSql = await readFile(`${process.cwd()}/drizzle/migrations/0018_private_group_invites.sql`, "utf8");
  const friend = /CREATE OR REPLACE FUNCTION public\.friend_action\([\s\S]*?\$\$;/.exec(friendsSql)?.[0];
  if (!friend) throw new Error("Missing real friend RPC");
  await db.exec(friend);
  await db.exec(await readFile(`${process.cwd()}/drizzle/migrations/0031_party_leaving_disbanding_and_account_friends.sql`, "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE public.party_account_members,public.profiles,public.account_preferences,public.parties,public.party_members,public.party_planning,public.party_preferences,public.party_preferences_v3,public.friendships,public.notifications CASCADE;
    INSERT INTO public.profiles VALUES('${host}'),('${guest}'),('${outsider}');
    INSERT INTO public.account_preferences VALUES('${host}','registered-host',true),('${guest}','registered-guest',true),('${outsider}','outsider',true);
    INSERT INTO public.parties(id,code) VALUES('${pid}','ABC123');
    INSERT INTO public.party_members(id,party_id,display_name,token_hash,is_host,joined_at,latitude,longitude,location_updated_at) VALUES
      ('${hostMember}','${pid}','Host',encode(sha256(convert_to('${hostToken}','UTF8')),'hex'),true,now()-interval '2 minutes',45.5,-73.5,now()),
      ('${guestMember}','${pid}','Guest',encode(sha256(convert_to('${guestToken}','UTF8')),'hex'),false,now()-interval '1 minute',45.6,-73.6,now()),
      ('${thirdMember}','${pid}','registered-guest',encode(sha256(convert_to('${thirdToken}','UTF8')),'hex'),false,now(),NULL,NULL,NULL);
    INSERT INTO public.party_planning(party_id,status,lock_id,lock_snapshot,participants,lock_started_at) VALUES('${pid}','locking',gen_random_uuid(),'{}',ARRAY['${hostMember}'::uuid,'${guestMember}'::uuid],now());
    INSERT INTO public.party_preferences VALUES('${guestMember}',true);
    INSERT INTO public.party_preferences_v3 VALUES('${guestMember}',true);
    SELECT set_config('request.jwt.claim.sub','',false); SET ROLE anon;`);
});
async function social(action: string, token = hostToken, member: string | null = null) {
  const row = (await db.query<{ result: Record<string, unknown> }>("SELECT public.party_social($1,'ABC123',$2,$3) AS result", [action, token, member])).rows[0];
  if (!row) throw new Error("Missing RPC result"); return row.result;
}
async function auth(id: string) { await db.exec("RESET ROLE"); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec("SET ROLE authenticated"); }
it("allows a guest to leave only their own capability and clears location, readiness and an active lease", async () => {
  expect(await social("leave", guestToken)).toEqual({ ok: true });
  await expect(social("list", guestToken)).rejects.toThrow(/left this party/);
  await db.exec("RESET ROLE");
  expect((await db.query("SELECT removed,latitude,longitude,location_updated_at FROM party_members WHERE id=$1", [guestMember])).rows).toEqual([{ removed: true, latitude: null, longitude: null, location_updated_at: null }]);
  expect((await db.query("SELECT status,lock_id,lock_snapshot,participants FROM party_planning")).rows).toEqual([{ status: "collecting", lock_id: null, lock_snapshot: null, participants: [] }]);
  expect((await db.query("SELECT confirmed FROM party_preferences")).rows).toEqual([{ confirmed: false }]);
});
it("permits voluntary rejoining but never reverses a host removal", async () => {
  await social("leave", guestToken);
  const joined = (await db.query<{ result: Record<string, unknown> }>("SELECT party_access('join','ABC123',$1,'Guest') AS result", [guestToken])).rows[0]?.result;
  expect(joined?.["selfId"]).toBe(guestMember);
  await db.query("SELECT party_access('remove','ABC123',$1,'',$2)", [hostToken, guestMember]);
  await expect(db.query("SELECT party_access('join','ABC123',$1,'Guest')", [guestToken])).rejects.toThrow(/removed from this party/);
});
it("transfers host authority to the next member when the host leaves", async () => {
  await social("leave");
  await db.exec("RESET ROLE");
  expect((await db.query("SELECT id FROM party_members WHERE is_host AND NOT removed")).rows).toEqual([{ id: guestMember }]);
});
it("rejects disbanding by a non-host and rejects forged capabilities", async () => {
  await expect(social("disband", guestToken)).rejects.toThrow(/Only the host/);
  await expect(social("leave", "d".repeat(64))).rejects.toThrow(/Join this party/);
  await expect(social("leave", "invalid")).rejects.toThrow(/Invalid membership/);
});
it("host disbanding permanently closes the party to every member and late joiner without deleting history", async () => {
  expect(await social("disband")).toEqual({ ok: true });
  for (const token of [hostToken, guestToken, "d".repeat(64)]) await expect(db.query("SELECT party_access('join','ABC123',$1,'Member')", [token])).rejects.toThrow(/disbanded/);
  await db.exec("RESET ROLE");
  expect((await db.query("SELECT count(*)::integer AS count FROM parties")).rows).toEqual([{ count: 1 }]);
  expect((await db.query("SELECT status,lock_id,lock_snapshot,options FROM party_planning")).rows).toEqual([{ status: "no_plan", lock_id: null, lock_snapshot: null, options: [] }]);
});
it("friend requests need two registered accounts with verified membership, not matching display names", async () => {
  await expect(social("attach")).rejects.toThrow(/sign in/);
  await auth(host); await social("attach");
  await expect(social("request", hostToken, thirdMember)).rejects.toThrow(/Only registered/);
  await auth(guest); await social("attach", guestToken);
  await auth(host); expect(await social("request", hostToken, guestMember)).toEqual({ ok: true, result: "requested" });
  expect(await social("list")).toEqual({ ok: true, items: [{ memberId: guestMember, username: "registered-guest", relationship: "outgoing" }] });
  await db.exec("RESET ROLE");
  expect((await db.query("SELECT user_id,kind FROM notifications")).rows).toEqual([{ user_id: guest, kind: "friend_request" }]);
});
it("does not allow another account to overwrite an existing member link", async () => {
  await auth(host); await social("attach");
  await auth(outsider); await expect(social("attach")).rejects.toThrow(/another account/);
  await expect(social("list")).rejects.toThrow(/Link your own/);
});
it("denies direct account-link table access to guests and registered members", async () => {
  await expect(db.query("SELECT * FROM party_account_members")).rejects.toThrow(/permission denied/);
  await auth(host); await expect(db.query("SELECT * FROM party_account_members")).rejects.toThrow(/permission denied/);
});