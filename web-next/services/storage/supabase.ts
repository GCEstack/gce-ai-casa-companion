import { getSupabaseAdmin, type SurveyResponse } from "@/lib/supabase/server";

export async function saveSurvey(data: SurveyResponse): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("survey_responses")
      .insert({
        email: data.email,
        child_age: data.child_age || "",
        interests: data.interests || "",
        priorities: data.priorities || "",
        feedback: data.feedback || "",
      } as any);

    if (error) {
      console.error("[supabase] survey insert error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[supabase] exception:", msg);
    return { success: false, error: msg };
  }
}
