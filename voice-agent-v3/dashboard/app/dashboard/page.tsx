import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const voiceServerUrl = process.env.VOICE_SERVER_URL;

  return <DashboardClient voiceServerUrl={voiceServerUrl ?? null} />;
}
