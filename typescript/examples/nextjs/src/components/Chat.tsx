"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signAndExecuteBytes, getPairedAccountId, connectWallet, ensureWalletConnector } from "@/lib/walletconnect";

type Message = { role: "user" | "assistant"; content: string };

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingBytes, setPendingBytes] = useState<string | null>(null);
    const [txStatus, setTxStatus] = useState<string | null>(null);
    const [accountId, setAccountId] = useState<string>("");

    const mode = process.env.NEXT_PUBLIC_AGENT_MODE;

    // In HITL mode, avoid auto-initializing WalletConnect on page load; derive account id on demand in submit/sign flows

    const submit = useCallback(async () => {
        setError(null);
        setLoading(true);
        const nextMessages = [...messages, { role: "user", content: input } as Message];
        setMessages(nextMessages);
        try {
            if (mode === "human") {
                // auto-derive accountId from wallet if not already set
                let acct = accountId;
                if (!acct) {
                    try { acct = await getPairedAccountId(); setAccountId(acct); } catch { }
                }
                const res = await fetch("/api/wallet/prepare", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ input, accountId: acct || undefined, messages: nextMessages }),
                });
                const json = await res.json();
                if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
                if (json.bytesBase64) {
                    setPendingBytes(json.bytesBase64);
                    setMessages(m => [...m, { role: "assistant", content: "Transaction requires signature." }]);
                } else {
                    const text = typeof json.result?.output === 'string'
                        ? json.result.output
                        : typeof json.result === 'string'
                            ? json.result
                            : JSON.stringify(json.result);
                    setMessages(m => [...m, { role: "assistant", content: text }]);
                }
            } else {
                const res = await fetch("/api/agent", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ input, messages: nextMessages }),
                });
                const json = await res.json();
                if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
                const text = typeof json.result?.output === 'string'
                    ? json.result.output
                    : typeof json.result === 'string'
                        ? json.result
                        : JSON.stringify(json.result);
                setMessages(m => [...m, { role: "assistant", content: text }]);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
            setInput("");
        }
    }, [input, messages, accountId, mode]);

    const sign = useCallback(async () => {
        if (!pendingBytes) return;
        try {
            setTxStatus("pending");
            // ensure connector initialised with low-noise logger
            await ensureWalletConnector("warn");
            // ensure we have an account id; if not, attempt to pair then derive
            let acct = accountId;
            if (!acct) {
                try {
                    acct = await getPairedAccountId();
                    setAccountId(acct);
                } catch {
                    const session = await connectWallet();
                    const derived = session?.namespaces?.hedera?.accounts?.[0]?.split(":").pop() ?? "";
                    if (!derived) throw new Error("No wallet account available after connecting");
                    acct = derived;
                    setAccountId(acct);
                }
            }
            const bytes = typeof window === "undefined" ? Buffer.from(pendingBytes, "base64") : Uint8Array.from(atob(pendingBytes), c => c.charCodeAt(0));
            const result = await signAndExecuteBytes({ bytes, accountId: acct });
            setTxStatus("confirmed");
            setMessages(m => [...m, { role: "assistant", content: JSON.stringify(result) }]);
            setPendingBytes(null);
        } catch (e) {
            setTxStatus(null);
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [pendingBytes, accountId]);

    const reviewVisible = useMemo(() => mode === "human" && Boolean(pendingBytes), [mode, pendingBytes]);

    // Auto-trigger signing when bytes are ready in HITL mode
    useEffect(() => {
        if (reviewVisible && !txStatus) {
            // fire and forget; errors will surface via setError in sign()
            void sign();
        }
    }, [reviewVisible]);

    return (
        <div className="w-full max-w-2xl flex flex-col gap-4">
            <div className="border rounded p-3 min-h-[200px]">
                {messages.length === 0 ? (
                    <div className="text-sm text-gray-500">No messages yet.</div>
                ) : (
                    messages.map((m, i) => (
                        <div key={i} className="text-sm whitespace-pre-wrap">
                            <span className="font-semibold">{m.role}:</span> {m.content}
                        </div>
                    ))
                )}
            </div>
            {/* Account ID input removed; derived from paired wallet in HITL mode */}
            <div className="flex items-center gap-2">
                <input
                    className="border rounded px-2 py-2 flex-1"
                    placeholder="Ask the agent..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    disabled={loading}
                />
                <button className="px-4 py-2 bg-black text-white rounded disabled:opacity-50" onClick={submit} disabled={loading || !input}>
                    Send
                </button>
            </div>
            {reviewVisible && (
                <div className="border rounded p-3 bg-yellow-50">
                    <div className="text-sm font-semibold mb-2">Review & Sign</div>
                    <div className="text-xs mb-2">A signing request has been sent to your wallet.</div>
                    {txStatus && <div className="text-xs mt-2">Status: {txStatus}</div>}
                </div>
            )}
            {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
    );
}


