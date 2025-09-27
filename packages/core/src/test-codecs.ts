import { createTableCodec } from "./codecs"

// Test the codec functionality
const testCodec = () => {
  console.log("Testing Zod 4.1 codec integration...")
  
  // Create a table codec with date and json fields
  const columnTypes: Record<string, "string" | "number" | "boolean" | "date" | "json"> = {
    id: "number",
    name: "string",
    created_at: "date",
    metadata: "json"
  }
  
  const tableCodec = createTableCodec(columnTypes)
  
  // Test encoding (application -> storage)
  const appData = {
    id: 1,
    name: "Test Item",
    created_at: new Date("2025-01-01T00:00:00.000Z"),
    metadata: { category: "test", tags: ["a", "b"] }
  }
  
  try {
    // Test encoding (application -> storage) using reverseTransform
    const storageData = (tableCodec as any)._def.reverseTransform(appData)
    console.log("✓ Encoding successful:")
    console.log("  App data:", appData)
    console.log("  Storage data:", storageData)
    
    // Test decoding (storage -> application) using parse
    const decodedData = tableCodec.parse(storageData)
    console.log("✓ Decoding successful:")
    console.log("  Decoded data:", decodedData)
    
    // Verify round-trip consistency
    const decodedRecord = decodedData as Record<string, unknown>
    console.log("✓ Round-trip test passed:", 
      decodedRecord.created_at instanceof Date && 
      (decodedRecord.created_at as Date).getTime() === appData.created_at.getTime())
      
  } catch (error) {
    console.error("✗ Codec test failed:", error)
  }
}

// Run the test
testCodec()