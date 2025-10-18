import { Columnist } from "./columnist"
import { Subscription, SubscriptionSchema, SubscriptionStatus, SubscriptionPlan, User, UserSchema } from "./subscription-schema"

// Database schema definitions
export const SubscriptionTableDefinition = {
  columns: {
    id: "string",
    userId: "string",
    plan: "string",
    status: "string",
    stripeCustomerId: "string",
    stripeSubscriptionId: "string",
    currentPeriodEnd: "date",
    cancelAtPeriodEnd: "boolean",
    createdAt: "date",
    updatedAt: "date"
  },
  primaryKey: "id",
  searchableFields: ["userId", "plan", "status"]
} as const

export const UserTableDefinition = {
  columns: {
    id: "string",
    email: "string",
    name: "string",
    createdAt: "date",
    updatedAt: "date"
  },
  primaryKey: "id",
  searchableFields: ["email", "name"]
} as const

export class SubscriptionService {
  private db: any
  
  constructor(db: any) {
    this.db = db
  }

  async initialize() {
    // Create tables if they don't exist
    await this.db.createTable("subscriptions", SubscriptionTableDefinition)
    await this.db.createTable("users", UserTableDefinition)
  }

  async getUserSubscription(userId: string): Promise<Subscription | null> {
    const subscriptions = await this.db.query("subscriptions", {
      where: { userId },
      limit: 1,
      orderBy: { createdAt: "desc" }
    })
    
    return subscriptions[0] ? SubscriptionSchema.parse(subscriptions[0]) : null
  }

  async updateUserSubscription(
    userId: string, 
    updates: Partial<Subscription>
  ): Promise<Subscription> {
    const existing = await this.getUserSubscription(userId)
    
    if (existing) {
      const updated = { ...existing, ...updates, updatedAt: new Date() }
      await this.db.update("subscriptions", existing.id!, updated)
      return SubscriptionSchema.parse(updated)
    } else {
      const newSubscription: Subscription = {
        userId,
        plan: updates.plan || "free",
        status: updates.status || "incomplete",
        stripeCustomerId: updates.stripeCustomerId,
        stripeSubscriptionId: updates.stripeSubscriptionId,
        currentPeriodEnd: updates.currentPeriodEnd,
        cancelAtPeriodEnd: updates.cancelAtPeriodEnd || false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      const id = await this.db.insert("subscriptions", newSubscription)
      return SubscriptionSchema.parse({ ...newSubscription, id })
    }
  }

  async createOrUpdateUser(userData: Partial<User> & { id: string }): Promise<User> {
    const existing = await this.db.query("users", {
      where: { id: userData.id },
      limit: 1
    })
    
    if (existing[0]) {
      const updated = { ...existing[0], ...userData, updatedAt: new Date() }
      await this.db.update("users", userData.id, updated)
      return UserSchema.parse(updated)
    } else {
      const newUser: User = {
        id: userData.id,
        email: userData.email || "",
        name: userData.name,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      await this.db.insert("users", newUser)
      return UserSchema.parse(newUser)
    }
  }

  async getUser(userId: string): Promise<User | null> {
    const users = await this.db.query("users", {
      where: { id: userId },
      limit: 1
    })
    
    return users[0] ? UserSchema.parse(users[0]) : null
  }

  async cancelSubscription(userId: string): Promise<Subscription> {
    const subscription = await this.getUserSubscription(userId)
    if (!subscription) {
      throw new Error("No subscription found for user")
    }

    return this.updateUserSubscription(userId, {
      status: "canceled",
      cancelAtPeriodEnd: true
    })
  }

  async reactivateSubscription(userId: string): Promise<Subscription> {
    const subscription = await this.getUserSubscription(userId)
    if (!subscription) {
      throw new Error("No subscription found for user")
    }

    return this.updateUserSubscription(userId, {
      status: "active",
      cancelAtPeriodEnd: false
    })
  }

  async getActiveSubscriptions(): Promise<Subscription[]> {
    const subscriptions = await this.db.query("subscriptions", {
      where: { status: ["active", "trialing"] as any }
    })
    
    return subscriptions.map((sub: any) => SubscriptionSchema.parse(sub))
  }

  async getUserSubscriptionsByStripeId(stripeSubscriptionId: string): Promise<Subscription[]> {
    const subscriptions = await this.db.query("subscriptions", {
      where: { stripeSubscriptionId }
    })
    
    return subscriptions.map((sub: any) => SubscriptionSchema.parse(sub))
  }
}