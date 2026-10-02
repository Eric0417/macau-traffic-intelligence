import { LanguageProvider } from "@/components/language-provider";
import { TrafficDashboard } from "@/components/dashboard/traffic-dashboard";

export default function Home() {
  return (
    <LanguageProvider>
      <TrafficDashboard />
    </LanguageProvider>
  );
}
