import type { Metadata } from "next";
import { Source_Code_Pro } from "next/font/google";
import { Chat } from "@/components/chat/Chat";
import "./chat.css";

const sourceMono = Source_Code_Pro({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-source-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "{s}hinyAudit · chat investigator",
  description: "Ask the swarm anything that lives on Somnia. Agent-native forensic investigations with on-chain receipts."
};

export default function ChatPage() {
  return (
    <div className={sourceMono.variable}>
      <Chat />
    </div>
  );
}
