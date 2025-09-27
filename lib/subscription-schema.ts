import { z } from "zod"

export const SubscriptionPlan = z.enum(["free", "pro", "enterprise"])
export type SubscriptionPlan = z.infer<typeof SubscriptionPlan>

export const SubscriptionStatus = z.enum([
  "active",
  "trialing", 
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired"
])
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>

export const SubscriptionSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  plan: SubscriptionPlan,
  status: SubscriptionStatus,
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  currentPeriodEnd: z.date().optional(),
  cancelAtPeriodEnd: z.boolean().default(false),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
})
export type Subscription = z.infer<typeof SubscriptionSchema>

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
})
export type User = z.infer<typeof UserSchema>

// Feature limits based on subscription plan
export const PlanLimits = {
  free: {
    maxRecords: 10000,
    maxStorage: 1024 * 1024 * 1024, // 1GB
    maxTeamMembers: 1,
    cloudSync: false,
    realTimeUpdates: false,
    analytics: false,
    customIntegrations: false,
    support: "community"
  },
  pro: {
    maxRecords: 100000,
    maxStorage: 10 * 1024 * 1024 * 1024, // 10GB
    maxTeamMembers: 5,
    cloudSync: true,
    realTimeUpdates: true,
    analytics: "basic",
    customIntegrations: false,
    support: "priority"
  },
  enterprise: {
    maxRecords: Infinity,
    maxStorage: Infinity,
    maxTeamMembers: Infinity,
    cloudSync: true,
    realTimeUpdates: true,
    analytics: "advanced",
    customIntegrations: true,
    support: "dedicated"
  }
} as const

export function getPlanLimits(plan: SubscriptionPlan) {
  return PlanLimits[plan]
}

export function canUseFeature(plan: SubscriptionPlan, feature: keyof typeof PlanLimits.free): boolean {
  const limits = PlanLimits[plan]
  
  switch (feature) {
    case "cloudSync":
    case "realTimeUpdates":
    case "customIntegrations":
      return limits[feature] as boolean
    case "analytics":
      return limits[feature] !== false
    default:
      return true
  }
}

export function getPlanFromStripePriceId(priceId: string): SubscriptionPlan {
  // Map Stripe price IDs to plans
  const priceToPlan: Record<string, SubscriptionPlan> = {
    [process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID || ""]: "pro",
    [process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID || ""]: "pro",
    // Add enterprise price IDs when available
  }
  
  return priceToPlan[priceId] || "free"
}