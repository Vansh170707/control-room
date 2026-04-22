import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  "https://sijltvxxydchxlqunwwb.supabase.co",
  "sb_publishable_YaN_lrz3wDea8IFSpOHe7w_GF-u7F1z"
);
const { data, error } = await supabase.functions.invoke("issue-command", {
  body: { agentId: "main", command: "echo test" },
  headers: { "x-clawbuddy-secret": "8e1ac42965c3ae95d2b9b9121879b2525cd66823813f71e75d03fd7b6b1750a9" }
});
console.log(data, error);
