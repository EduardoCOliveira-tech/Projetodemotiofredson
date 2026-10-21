// lib/zod-to-gemini.ts
// Converte um schema Zod (v3) no formato `Schema` (subset OpenAPI) aceito por
// `responseSchema` do @google/genai. Suporta: object, array, string, number,
// boolean, enum, nullable, optional, default e descrições (.describe()).

import { Type, type Schema } from "@google/genai"
import type { ZodTypeAny } from "zod"

export function zodToGeminiSchema(schema: ZodTypeAny): Schema {
  const def = schema._def as { typeName: string; description?: string; [k: string]: any }
  const description = schema.description ?? def.description
  const withDesc = (s: Schema): Schema => (description ? { ...s, description } : s)

  switch (def.typeName) {
    case "ZodObject": {
      const shape = (schema as any).shape as Record<string, ZodTypeAny>
      const properties: Record<string, Schema> = {}
      const required: string[] = []
      const ordering: string[] = []
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToGeminiSchema(value)
        ordering.push(key)
        if (!value.isOptional()) required.push(key)
      }
      return withDesc({ type: Type.OBJECT, properties, required, propertyOrdering: ordering })
    }
    case "ZodArray":
      return withDesc({ type: Type.ARRAY, items: zodToGeminiSchema(def.type) })
    case "ZodString":
      return withDesc({ type: Type.STRING })
    case "ZodNumber":
      return withDesc({ type: def.checks?.some((c: any) => c.kind === "int") ? Type.INTEGER : Type.NUMBER })
    case "ZodBoolean":
      return withDesc({ type: Type.BOOLEAN })
    case "ZodEnum":
      return withDesc({ type: Type.STRING, format: "enum", enum: [...def.values] })
    case "ZodNullable":
      return withDesc({ ...zodToGeminiSchema(def.innerType), nullable: true })
    case "ZodOptional":
    case "ZodDefault":
      return withDesc(zodToGeminiSchema(def.innerType))
    case "ZodEffects":
      return withDesc(zodToGeminiSchema(def.schema))
    default:
      throw new Error(`zodToGeminiSchema: tipo Zod não suportado (${def.typeName})`)
  }
}

