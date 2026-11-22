import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ACCESSIBILITY_TAGS, DIETARY_TAGS } from "./contract";

export type AccountNeeds = { dietary: string[]; accessibility: string[] };

const DIETARY_MAP: Record<string, (typeof DIETARY_TAGS)[number]> = {
  Vegetarian: "vegetarian", Vegan: "vegan", Halal: "halal", Kosher: "kosher",
  "Gluten-free": "gluten_free", "Dairy-free": "dairy_free", "Nut allergy": "nut_allergy",
  Peanuts: "nut_allergy", "Tree nuts": "nut_allergy", Milk: "dairy_free", Wheat: "gluten_free",
};
const ACCESS_MAP: Record<string, (typeof ACCESSIBILITY_TAGS)[number]> = {
  "Step-free access": "wheelchair_accessible_entrance",
  "Accessible toilets": "wheelchair_accessible_restroom",
  "Seating available": "wheelchair_accessible_seating",
};

/** Maps saved account answers onto the planner's food and accessibility tags. */
export function accountNeedsFrom(p: { dietary: string[] | null; food_allergies: string[] | null; accessibility: string[] | null }): AccountNeeds {
  const pick = <T extends string>(values: (string | undefined)[]) => [...new Set(values.filter((v): v is T => !!v))].sort();
  return {
    dietary: pick([...(p.dietary ?? []), ...(p.food_allergies ?? [])].map((v) => DIETARY_MAP[v])),
    accessibility: pick((p.accessibility ?? []).map((v) => ACCESS_MAP[v])),
  };
}

/** Signed-in members' saved food/accessibility answers; null for guests or until loaded. */
export function useAccountNeeds(): AccountNeeds | null {
  const [needs, setNeeds] = useState<AccountNeeds | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return;
      const { data: p } = await supabase.from("account_preferences").select("dietary, food_allergies, accessibility, completed").eq("user_id", user.id).maybeSingle();
      if (live && p?.completed) setNeeds(accountNeedsFrom(p));
    })();
    return () => { live = false; };
  }, []);
  return needs;
}
