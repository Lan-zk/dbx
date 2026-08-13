import { describe, expect, it } from "vitest";
import { filterAiConversations } from "@/lib/ai/aiConversationSearch";

const conversations = [
  {
    id: "mysql-users",
    title: "Repair user records",
    connectionName: "dev-mysql",
    database: "accounts",
    messages: [
      { role: "user", content: "How can I find duplicate email addresses?" },
      { role: "assistant", content: "Use a GROUP BY query with HAVING COUNT(*) > 1." },
    ],
  },
  {
    id: "postgres-orders",
    title: "订单排查",
    connectionName: "prod-postgres",
    database: "commerce",
    messages: [{ role: "user", content: "查询昨天失败的订单" }],
  },
];

describe("filterAiConversations", () => {
  it("finds history by title, connection, database, or message text without case sensitivity", () => {
    expect(filterAiConversations(conversations, "  REPAIR  ").map((conversation) => conversation.id)).toEqual(["mysql-users"]);
    expect(filterAiConversations(conversations, "POSTGRES").map((conversation) => conversation.id)).toEqual(["postgres-orders"]);
    expect(filterAiConversations(conversations, "ACCOUNTS").map((conversation) => conversation.id)).toEqual(["mysql-users"]);
    expect(filterAiConversations(conversations, "duplicate EMAIL").map((conversation) => conversation.id)).toEqual(["mysql-users"]);
    expect(filterAiConversations(conversations, "失败的订单").map((conversation) => conversation.id)).toEqual(["postgres-orders"]);
  });

  it("restores the complete history when the search is cleared", () => {
    expect(filterAiConversations(conversations, "   ")).toEqual(conversations);
  });

  it("returns an empty history when no conversation matches", () => {
    expect(filterAiConversations(conversations, "oracle")).toEqual([]);
  });
});
