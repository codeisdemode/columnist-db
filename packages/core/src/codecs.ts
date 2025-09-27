import { z } from "zod"

/**
 * Common codecs for database operations
 * Using Zod 4.1's new codec API for bi-directional transformations
 */

export const dateCodec = z.codec(
  z.string().datetime(),
  z.date(),
  {
    decode: (input: string) => new Date(input),
    encode: (output: Date) => output.toISOString()
  }
)

export const jsonCodec = z.codec(
  z.string(),
  z.unknown(),
  {
    decode: (input: string) => JSON.parse(input),
    encode: (output: unknown) => JSON.stringify(output)
  }
)

export const bigIntCodec = z.codec(
  z.string(),
  z.bigint(),
  {
    decode: (input: string) => BigInt(input),
    encode: (output: bigint) => output.toString()
  }
)

// Schema validation with codec integration
export function createValidatedCodec(
  schema: z.ZodSchema,
  transform?: {
    decode?: (data: unknown) => unknown,
    encode?: (data: unknown) => unknown
  }
) {
  return z.codec(
    schema,
    schema,
    {
      decode: (input: unknown) => {
        const validated = schema.parse(input)
        return transform?.decode ? transform.decode(validated) : validated
      },
      encode: (output: unknown) => {
        const validated = schema.parse(output)
        return transform?.encode ? transform.encode(validated) : validated
      }
    }
  )
}

// Utility to create table-specific codecs
export function createTableCodec(
  columnTypes: Record<string, "string" | "number" | "boolean" | "date" | "json">,
  customValidation?: z.ZodSchema
) {
  const shape: Record<string, z.ZodTypeAny> = {}
  
  for (const [column, type] of Object.entries(columnTypes)) {
    switch (type) {
      case "date":
        shape[column] = z.date()
        break
      case "json":
        shape[column] = z.unknown()
        break
      case "number":
        shape[column] = z.number()
        break
      case "boolean":
        shape[column] = z.boolean()
        break
      case "string":
      default:
        shape[column] = z.string()
        break
    }
  }
  
  const baseSchema = z.object(shape)
  const finalSchema = customValidation || baseSchema
  
  return createValidatedCodec(finalSchema, {
    encode: (data: unknown) => {
      // Convert to storage format (Dates to ISO strings, etc.)
      const recordData = data as Record<string, unknown>
      const storageData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(recordData)) {
        if (value instanceof Date) {
          storageData[key] = value.toISOString()
        } else if (typeof value === 'object' && value !== null) {
          storageData[key] = JSON.stringify(value)
        } else {
          storageData[key] = value
        }
      }
      return storageData
    },
    decode: (data: unknown) => {
      // Convert from storage format (ISO strings to Dates, etc.)
      const recordData = data as Record<string, unknown>
      const appData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(recordData)) {
        if (typeof value === 'string') {
          // Check if it's a date string
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
            appData[key] = new Date(value)
          }
          // Check if it's JSON string
          else if ((value.startsWith('{') && value.endsWith('}')) || 
                   (value.startsWith('[') && value.endsWith(']'))) {
            try {
              appData[key] = JSON.parse(value)
            } catch {
              appData[key] = value
            }
          } else {
            appData[key] = value
          }
        } else {
          appData[key] = value
        }
      }
      return appData
    }
  })
}

export type TableCodec = ReturnType<typeof createTableCodec>