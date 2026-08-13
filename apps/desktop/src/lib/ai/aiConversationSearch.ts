export interface AiConversationSearchItem {
  title: string;
  connectionName: string;
  database: string;
  messages: readonly { content: string }[];
}

export function filterAiConversations<T extends AiConversationSearchItem>(conversations: readonly T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [...conversations];

  return conversations.filter((conversation) => {
    const searchableText = [conversation.title, conversation.connectionName, conversation.database, ...conversation.messages.map((message) => message.content)].join("\n").toLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}
