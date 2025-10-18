# Columnist-DB AI Memory Examples

## 🎯 Quick Start Examples

### Basic Memory Operations

```typescript
// Store a conversation with AI
await mcp.store_conversation({
  messages: JSON.stringify([
    { role: "user", content: "What is machine learning?" },
    { role: "assistant", content: "Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed." },
    { role: "user", content: "Can you give examples of ML algorithms?" },
    { role: "assistant", content: "Common ML algorithms include linear regression, decision trees, neural networks, and clustering algorithms like k-means." }
  ]),
  summary: "Introduction to machine learning concepts",
  tags: "ai, machine-learning, education"
});

// Search for related content
const results = await mcp.search_memory({
  query: "machine learning algorithms",
  content_type: "conversation",
  limit: 5
});

// Get memory statistics
const stats = await mcp.get_memory_stats();
console.log(stats);
```

### Document Storage Example

```typescript
// Store technical documentation
await mcp.store_document({
  content: `# Neural Networks Guide

Neural networks are computing systems inspired by biological neural networks. They consist of layers of interconnected nodes (neurons) that process information.

## Key Components:
- Input Layer: Receives data
- Hidden Layers: Process data
- Output Layer: Produces results

## Common Types:
- Feedforward Neural Networks
- Convolutional Neural Networks (CNNs)
- Recurrent Neural Networks (RNNs)
- Transformers
`,
  title: "Neural Networks Technical Guide",
  author: "AI Assistant",
  document_type: "technical",
  tags: "ai, neural-networks, deep-learning, technical"
});

// Search for neural network content
const neuralResults = await mcp.search_memory({
  query: "neural networks hidden layers",
  content_type: "document"
});
```

### Web Content Archiving

```typescript
// Store web page content
await mcp.store_web_content({
  content: "Full web page content about AI ethics and safety considerations...",
  url: "https://example.com/ai-ethics",
  title: "AI Ethics and Safety Guidelines",
  summary: "Comprehensive guide to ethical AI development and deployment"
});

// Find related web content
const relatedWeb = await mcp.find_related_content({
  topic: "AI safety",
  similarity_threshold: 0.8
});
```

## 🔄 Real-World Use Cases

### LLM Context Management

```typescript
// Store important context before session ends
async function saveImportantContext(context) {
  await mcp.store_content({
    content: context,
    content_type: "context",
    title: "Important Session Context",
    tags: "context, important, session",
    metadata: JSON.stringify({
      sessionId: "session_123",
      priority: "high",
      timestamp: Date.now()
    })
  });
}

// Retrieve context in new session
async function loadSessionContext(sessionId) {
  const context = await mcp.search_memory({
    query: sessionId,
    content_type: "context"
  });
  return context.length > 0 ? context[0].content : null;
}
```

### Research Assistant Memory

```typescript
// Store research findings
async function storeResearchFinding(topic, findings, sources) {
  await mcp.store_document({
    content: findings,
    title: `Research: ${topic}`,
    author: "Research Assistant",
    document_type: "research",
    tags: `research, ${topic.toLowerCase().replace(/\s+/g, '-')}`,
    metadata: JSON.stringify({
      sources: sources,
      researchDate: new Date().toISOString(),
      confidence: "high"
    })
  });
}

// Find related research
async function findRelatedResearch(topic) {
  const related = await mcp.find_related_content({
    topic: topic,
    similarity_threshold: 0.7
  });

  // Also search by tags
  const tagResults = await mcp.search_memory({
    query: topic,
    tags: "research"
  });

  return [...related, ...tagResults];
}
```

### Customer Support Memory

```typescript
// Store customer interaction
async function storeCustomerInteraction(customerId, conversation, issueType) {
  await mcp.store_conversation({
    messages: JSON.stringify(conversation),
    summary: `Customer ${customerId} - ${issueType} issue`,
    tags: `support, ${issueType}, customer-${customerId}`
  });
}

// Search for similar customer issues
async function findSimilarIssues(issueDescription) {
  const similar = await mcp.search_conversations({
    query: issueDescription,
    tags: "support"
  });

  return similar.map(conv => ({
    id: conv.id,
    summary: conv.title,
    similarity: conv.score
  }));
}
```

## 🛠️ Advanced Patterns

### Context Window Extension

```typescript
// When context window is getting full
async function extendContextWindow(importantInfo) {
  // Store important information to memory
  await mcp.store_content({
    content: importantInfo,
    content_type: "context-extension",
    title: "Context Extension - Important Info",
    tags: "context, extension, important"
  });

  return "Important context stored in memory for later retrieval";
}

// Retrieve context when needed
async function retrieveContext(query) {
  const results = await mcp.search_memory({
    query: query,
    content_type: "context-extension",
    limit: 3
  });

  return results.map(r => r.content).join('\n\n');
}
```

### Personalization Memory

```typescript
// Store user preferences
async function storeUserPreferences(userId, preferences) {
  await mcp.store_content({
    content: JSON.stringify(preferences),
    content_type: "preference",
    title: `User Preferences: ${userId}`,
    tags: `user, preferences, ${userId}`,
    metadata: JSON.stringify({
      userId: userId,
      lastUpdated: new Date().toISOString()
    })
  });
}

// Retrieve user preferences
async function getUserPreferences(userId) {
  const prefs = await mcp.search_memory({
    query: userId,
    content_type: "preference"
  });

  if (prefs.length > 0) {
    return JSON.parse(prefs[0].content);
  }
  return null;
}
```

### Project Memory Management

```typescript
// Store project details
async function storeProjectMemory(projectId, details, requirements) {
  await mcp.store_document({
    content: `Project: ${projectId}\n\nDetails: ${details}\n\nRequirements: ${requirements}`,
    title: `Project Memory: ${projectId}`,
    author: "Project Assistant",
    document_type: "project",
    tags: `project, ${projectId}, requirements`
  });
}

// Find project-related information
async function getProjectContext(projectId) {
  const projectInfo = await mcp.search_memory({
    query: projectId,
    content_type: "document",
    tags: "project"
  });

  const relatedConversations = await mcp.search_conversations({
    query: projectId,
    tags: "project"
  });

  return {
    projectDocuments: projectInfo,
    projectConversations: relatedConversations
  };
}
```

## 🔧 Memory Management

### Regular Cleanup

```typescript
// Clear temporary test data
async function cleanupTestData() {
  await mcp.clear_memory({
    content_type: "test"
  });
  console.log("Test data cleared");
}

// Clear old temporary content
async function cleanupOldTemporaryContent(daysOld = 30) {
  // This would require checking creation dates
  // For now, clear by tags
  await mcp.clear_memory({
    tags: "temporary, test"
  });
}
```

### Memory Export and Backup

```typescript
// Export all memory as JSON backup
async function backupMemory() {
  const exportData = await mcp.export_memory({
    format: "json"
  });

  // Save to file or cloud storage
  return exportData;
}

// Export conversations as CSV for analysis
async function exportConversationsCSV() {
  const csvExport = await mcp.export_memory({
    format: "csv",
    content_type: "conversation"
  });

  return csvExport;
}
```

### Memory Statistics and Monitoring

```typescript
// Monitor memory usage
async function monitorMemoryHealth() {
  const stats = await mcp.get_memory_stats();

  console.log(`Memory Health Report:`);
  console.log(`- Total Items: ${stats.totalItems}`);
  console.log(`- By Type: ${JSON.stringify(stats.byType)}`);
  console.log(`- Recent Activity: ${JSON.stringify(stats.recentActivity)}`);

  // Alert if memory is getting too large
  if (stats.totalItems > 1000) {
    console.warn("Memory size is large, consider cleanup");
  }

  return stats;
}
```

## 🎯 Integration Patterns

### With Claude Code

```typescript
// Example Claude Code integration
async function claudeMemoryIntegration() {
  // Store current conversation context
  const currentContext = "User is working on AI project, interested in neural networks and machine learning";

  await mcp.store_content({
    content: currentContext,
    content_type: "session-context",
    title: "Claude Session Context",
    tags: "claude, session, context"
  });

  // Retrieve previous context when needed
  const previousContext = await mcp.search_memory({
    query: "AI project neural networks",
    content_type: "session-context"
  });

  return previousContext;
}
```

### Multi-Session Context Flow

```typescript
// Session 1: Store important information
async function session1() {
  await mcp.store_content({
    content: "User prefers detailed technical explanations with code examples",
    content_type: "preference",
    title: "User Communication Preferences",
    tags: "user, preferences, communication"
  });

  await mcp.store_conversation({
    messages: JSON.stringify([
      { role: "user", content: "Explain neural networks" },
      { role: "assistant", content: "Neural networks are... [detailed explanation]" }
    ]),
    summary: "Neural networks explanation session",
    tags: "neural-networks, education, technical"
  });
}

// Session 2: Retrieve and use previous context
async function session2() {
  // Get user preferences
  const preferences = await mcp.search_memory({
    query: "user preferences communication",
    content_type: "preference"
  });

  // Get previous neural network explanations
  const previousExplanations = await mcp.search_conversations({
    query: "neural networks",
    tags: "neural-networks"
  });

  // Use this context to provide personalized responses
  const userPrefersTechnical = preferences.length > 0;
  const hasPreviousExplanation = previousExplanations.length > 0;

  return {
    userPrefersTechnical,
    hasPreviousExplanation,
    previousContent: previousExplanations
  };
}
```

## 🚀 Performance Tips

1. **Use Content Type Filters**: Always filter searches by content type when possible
2. **Leverage Tags**: Use descriptive tags for better filtering
3. **Batch Operations**: Group related memory operations
4. **Regular Cleanup**: Clear temporary and test data regularly
5. **Monitor Statistics**: Use `get_memory_stats()` to track usage patterns

## 🔍 Debugging Examples

```typescript
// Test memory functionality
async function testMemorySystem() {
  // Store test content
  await mcp.store_content({
    content: "Test content for memory system verification",
    content_type: "test",
    title: "Memory System Test",
    tags: "test, verification"
  });

  // Search for test content
  const results = await mcp.search_memory({
    query: "test content",
    content_type: "test"
  });

  // Get statistics
  const stats = await mcp.get_memory_stats();

  // Clear test data
  await mcp.clear_memory({
    content_type: "test"
  });

  return {
    searchResults: results,
    memoryStats: stats,
    testCompleted: true
  };
}
```

These examples demonstrate the full power of Columnist-DB AI Memory for managing LLM context windows and providing persistent memory across sessions.