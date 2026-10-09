"use client";

import { useChat } from "@ai-sdk/react";
import { FormEvent } from "react";

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: "/api/chat"
    });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(e);
  };

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "2rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        minHeight: "100vh"
      }}
    >
      <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Next.js Basic Chat</h1>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          border: "1px solid rgba(148,163,184,0.35)",
          padding: "1rem",
          borderRadius: 12,
          backgroundColor: "#0f172a90",
          maxHeight: "60vh",
          overflowY: "auto"
        }}
      >
        {messages.map(m => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              backgroundColor:
                m.role === "user"
                  ? "rgba(59,130,246,0.2)"
                  : "rgba(15,23,42,0.85)",
              borderRadius: 8,
              padding: "0.6rem 0.8rem",
              maxWidth: "75%"
            }}
          >
            <div
              style={{
                opacity: 0.7,
                fontSize: "0.75rem",
                marginBottom: 4
              }}
            >
              {m.role === "user" ? "You" : "AI"}
            </div>
            {m.content}
          </div>
        ))}

        {error && (
          <div style={{ color: "#f87171", fontSize: "0.9rem" }}>
            {String(error.message ?? error)}
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center"
        }}
      >
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask something..."
          style={{
            flex: 1,
            padding: "0.7rem 1rem",
            borderRadius: 999,
            border: "1px solid rgba(148,163,184,0.5)",
            backgroundColor: "#0f172a",
            color: "#e2e8f0"
          }}
        />

        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            padding: "0.7rem 1.1rem",
            borderRadius: 999,
            background:
              "linear-gradient(to right, rgb(59,130,246), rgb(56,189,248))",
            border: "none",
            fontWeight: 600,
            cursor: isLoading ? "default" : "pointer",
            opacity: isLoading || !input.trim() ? 0.5 : 1
          }}
        >
          {isLoading ? "..." : "Send"}
        </button>
      </form>
    </main>
  );
}
