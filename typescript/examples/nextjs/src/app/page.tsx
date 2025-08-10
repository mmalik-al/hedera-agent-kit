import { createAgentBootstrap } from "@/lib/agent";
import WalletConnectClient from "@/components/WalletConnectClient";
import Chat from "@/components/Chat";

export default function Home() {
  const { mode, network } = createAgentBootstrap();
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <div className="fixed left-0 top-0 w-full flex justify-center text-xs text-gray-600 dark:text-gray-300 py-2">
          <span className="font-semibold">Mode:</span>&nbsp;{mode}&nbsp;|&nbsp;
          <span className="font-semibold">Network:</span>&nbsp;{network}
        </div>
        {mode === "human" && <WalletConnectClient />}
        <Chat />
      </main>
    </div>
  );
}
