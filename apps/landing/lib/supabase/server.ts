import { createClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

export type SurveyResponse = {
  email: string;
  child_age?: string;
  interests?: string;
  priorities?: string;
  feedback?: string;
};

type Database = {
  public: {
    Tables: {
      survey_responses: {
        Row: {
          id: string;
          email: string;
          child_age: string;
          interests: string;
          priorities: string;
          feedback: string;
          created_at: string;
        };
        Insert: SurveyResponse;
      };
    };
  };
};

let _admin: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseAdmin() {
  if (!_admin) {
    _admin = createClient<Database>(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}
