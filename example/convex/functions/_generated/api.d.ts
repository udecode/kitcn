/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  admin: {
    checkUserAdminStatus: FunctionReference<
      "query",
      "public",
      { userId: string },
      { isAdmin: boolean; role?: string | null }
    >;
    getAllUsers: FunctionReference<
      "query",
      "public",
      {
        cursor?: string | null;
        limit?: number;
        role?: "all" | "user" | "admin";
        search?: string;
      },
      {
        continueCursor: string | null;
        isDone: boolean;
        page: Array<{
          banExpiresAt?: any | null;
          banReason?: string | null;
          createdAt: any;
          email: string;
          id: string;
          image?: string | null;
          isBanned?: boolean | null;
          name?: string;
          role: string;
        } | null>;
      }
    >;
    getDashboardStats: FunctionReference<
      "query",
      "public",
      {},
      {
        recentUsers: Array<{
          createdAt: any;
          id: string;
          image?: string | null;
          name?: string;
        }>;
        totalAdmins: number;
        totalUsers: number;
        userGrowth: Array<{ count: number; date: string }>;
      }
    >;
    grantAdminByEmail: FunctionReference<
      "mutation",
      "public",
      { email: string; role: "admin" },
      { success: boolean; userId?: string }
    >;
    updateUserRole: FunctionReference<
      "mutation",
      "public",
      { role: "user" | "admin"; userId: string },
      boolean
    >;
  };
  items: {
    queries: {
      get: FunctionReference<"query", "public", { id: string }, string | null>;
      list: FunctionReference<"query", "public", {}, Array<string>>;
    };
  };
  organization: {
    acceptInvitation: FunctionReference<
      "mutation",
      "public",
      { invitationId: string },
      any
    >;
    addMember: FunctionReference<
      "mutation",
      "public",
      { role: "owner" | "member"; userId: string },
      any
    >;
    cancelInvitation: FunctionReference<
      "mutation",
      "public",
      { invitationId: string },
      any
    >;
    checkSlug: FunctionReference<
      "query",
      "public",
      { slug: string },
      { available: boolean }
    >;
    createOrganization: FunctionReference<
      "mutation",
      "public",
      { name: string },
      { id: string; slug: string }
    >;
    deleteOrganization: FunctionReference<
      "mutation",
      "public",
      { organizationId: string },
      any
    >;
    getActiveMember: FunctionReference<
      "query",
      "public",
      {},
      { createdAt: any; id: string; role: string } | null
    >;
    getOrganization: FunctionReference<
      "query",
      "public",
      { slug: string },
      {
        createdAt: any;
        id: string;
        isActive: boolean;
        isPersonal: boolean;
        logo?: string | null;
        membersCount: number;
        name: string;
        plan: string;
        role?: string;
        slug: string;
      } | null
    >;
    getOrganizationOverview: FunctionReference<
      "query",
      "public",
      { inviteId?: string; slug: string },
      {
        createdAt: any;
        id: string;
        invitation: {
          email: string;
          expiresAt: any;
          id: string;
          inviterEmail: string;
          inviterId: string;
          inviterName: string;
          inviterUsername: string | null;
          organizationId: string;
          organizationName: string;
          organizationSlug: string;
          role: string;
          status: string;
        } | null;
        isActive: boolean;
        isPersonal: boolean;
        logo?: string | null;
        membersCount: number;
        name: string;
        plan?: string;
        role?: string;
        slug: string;
      } | null
    >;
    inviteMember: FunctionReference<
      "mutation",
      "public",
      { email: string; organizationId: string; role: "owner" | "member" },
      any
    >;
    leaveOrganization: FunctionReference<
      "mutation",
      "public",
      { organizationId: string },
      any
    >;
    listMembers: FunctionReference<
      "query",
      "public",
      { slug: string },
      {
        currentUserRole?: string;
        isPersonal: boolean;
        members: Array<{
          createdAt: any;
          id: string;
          organizationId: string;
          role?: string;
          user: {
            email: string;
            id: string;
            image?: string | null;
            name: string | null;
          };
          userId: string;
        }>;
      }
    >;
    listOrganizations: FunctionReference<
      "query",
      "public",
      {},
      {
        canCreateOrganization: boolean;
        organizations: Array<{
          createdAt: any;
          id: string;
          isPersonal: boolean;
          logo?: string | null;
          name: string;
          plan: string;
          slug: string;
        }>;
      }
    >;
    listPendingInvitations: FunctionReference<
      "query",
      "public",
      { slug: string },
      Array<{
        createdAt: any;
        email: string;
        expiresAt: any;
        id: string;
        organizationId: string;
        role: string;
        status: string;
      }>
    >;
    listUserInvitations: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        expiresAt: any;
        id: string;
        inviterName: string | null;
        organizationName: string;
        organizationSlug: string;
        role: string;
      }>
    >;
    listUserOrganizations: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        createdAt: any;
        id: string;
        logo?: string | null;
        name: string;
        role: string;
        slug: string;
      }>
    >;
    rejectInvitation: FunctionReference<
      "mutation",
      "public",
      { invitationId: string },
      any
    >;
    removeMember: FunctionReference<
      "mutation",
      "public",
      { memberId: string },
      any
    >;
    setActiveOrganization: FunctionReference<
      "mutation",
      "public",
      { organizationId: string },
      any
    >;
    updateMemberRole: FunctionReference<
      "mutation",
      "public",
      { memberId: string; role: "owner" | "member" },
      any
    >;
    updateOrganization: FunctionReference<
      "mutation",
      "public",
      { logo?: string; name?: string; organizationId: string; slug?: string },
      any
    >;
  };
  polarSubscription: {
    cancelSubscription: FunctionReference<
      "action",
      "public",
      {},
      { message: string; success: boolean }
    >;
    getOrganizationSubscription: FunctionReference<
      "query",
      "public",
      { organizationId: string },
      {
        cancelAtPeriodEnd: boolean;
        currentPeriodEnd?: string | null;
        status: string;
        subscriptionId: string;
      } | null
    >;
    resumeSubscription: FunctionReference<
      "action",
      "public",
      {},
      { message: string; success: boolean }
    >;
  };
  projects: {
    addMember: FunctionReference<
      "mutation",
      "public",
      { projectId: string; userEmail: string },
      any
    >;
    archive: FunctionReference<
      "mutation",
      "public",
      { projectId: string },
      any
    >;
    create: FunctionReference<
      "mutation",
      "public",
      { description?: string; isPublic?: boolean; name: string },
      string
    >;
    get: FunctionReference<
      "query",
      "public",
      { projectId: string },
      {
        archived: boolean;
        completedTodoCount: number;
        createdAt: any;
        description?: string | null;
        id: string;
        isPublic: boolean;
        members: Array<{
          email: string;
          id: string;
          joinedAt: any;
          name: string | null;
        }>;
        name: string;
        owner: { email: string; id: string; name: string | null };
        ownerId: string;
        todoCount: number;
      } | null
    >;
    leave: FunctionReference<"mutation", "public", { projectId: string }, any>;
    list: FunctionReference<
      "query",
      "public",
      { cursor?: string | null; includeArchived?: boolean; limit?: number },
      {
        continueCursor: string | null;
        isDone: boolean;
        page: Array<{
          archived: boolean;
          completedTodoCount: number;
          createdAt: any;
          description?: string | null;
          id: string;
          isOwner: boolean;
          isPublic: boolean;
          memberCount: number;
          name: string;
          ownerId: string;
          todoCount: number;
        }>;
      }
    >;
    listForDropdown: FunctionReference<
      "query",
      "public",
      {},
      Array<{ id: string; isOwner: boolean; name: string }>
    >;
    removeMember: FunctionReference<
      "mutation",
      "public",
      { projectId: string; userId: string },
      any
    >;
    restore: FunctionReference<
      "mutation",
      "public",
      { projectId: string },
      any
    >;
    transfer: FunctionReference<
      "mutation",
      "public",
      { newOwnerId: string; projectId: string },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        description?: string | null;
        isPublic?: boolean;
        name?: string;
        projectId: string;
      },
      any
    >;
  };
  public: {
    hello: FunctionReference<"query", "public", {}, { message: string }>;
  };
  seed: {
    generateSamples: FunctionReference<
      "action",
      "public",
      { count?: number },
      { created: number; todosCreated: number }
    >;
  };
  tags: {
    create: FunctionReference<
      "mutation",
      "public",
      { color?: string; name: string },
      string
    >;
    deleteTag: FunctionReference<"mutation", "public", { tagId: string }, any>;
    list: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        color: string;
        createdAt: any;
        id: string;
        name: string;
        usageCount: number;
      }>
    >;
    merge: FunctionReference<
      "mutation",
      "public",
      { sourceTagId: string; targetTagId: string },
      any
    >;
    popular: FunctionReference<
      "query",
      "public",
      { limit?: number },
      Array<{
        color: string;
        id: string;
        isOwn: boolean;
        name: string;
        usageCount: number;
      }>
    >;
    update: FunctionReference<
      "mutation",
      "public",
      { color?: string; name?: string; tagId: string },
      any
    >;
  };
  todoComments: {
    addComment: FunctionReference<
      "mutation",
      "public",
      { content: string; parentId?: string; todoId: string },
      string
    >;
    deleteComment: FunctionReference<
      "mutation",
      "public",
      { commentId: string },
      any
    >;
    getCommentThread: FunctionReference<
      "query",
      "public",
      { commentId: string; maxDepth?: number },
      {
        comment: {
          ancestors: Array<{
            content: string;
            id: string;
            user: { name?: string } | null;
          }>;
          content: string;
          createdAt: any;
          id: string;
          parent: {
            content: string;
            id: string;
            user: { name?: string } | null;
          } | null;
          replies: Array<any>;
          todo: { completed: boolean; title: string };
          todoId: string;
          user: { id: string; image?: string | null; name?: string } | null;
        };
      } | null
    >;
    getTodoComments: FunctionReference<
      "query",
      "public",
      {
        cursor?: string | null;
        includeReplies?: boolean;
        limit?: number;
        maxReplyDepth?: number;
        todoId: string;
      },
      {
        continueCursor: string | null;
        isDone: boolean;
        page: Array<{
          content: string;
          createdAt: any;
          id: string;
          replies: Array<any>;
          replyCount: number;
          user: { id: string; image?: string | null; name?: string } | null;
        }>;
      }
    >;
    getUserComments: FunctionReference<
      "query",
      "public",
      {
        cursor?: string | null;
        includeTodo?: boolean;
        limit?: number;
        userId: string;
      },
      {
        continueCursor: string | null;
        isDone: boolean;
        page: Array<{
          content: string;
          createdAt: any;
          id: string;
          isReply: boolean;
          parentPreview?: { content: string; userName?: string };
          todo?: { completed: boolean; id: string; title: string } | null;
        }>;
      }
    >;
    updateComment: FunctionReference<
      "mutation",
      "public",
      { commentId: string; content: string },
      any
    >;
  };
  todos: {
    bulkDelete: FunctionReference<
      "mutation",
      "public",
      { ids: Array<string> },
      { deleted: number; errors: Array<string> }
    >;
    create: FunctionReference<
      "mutation",
      "public",
      {
        description?: string;
        dueDate?: any;
        priority?: "low" | "medium" | "high";
        projectId?: string;
        tagIds?: Array<string>;
        title: string;
      },
      string
    >;
    deleteTodo: FunctionReference<"mutation", "public", { id: string }, any>;
    get: FunctionReference<
      "query",
      "public",
      { id: string },
      {
        completed: boolean;
        createdAt: any;
        deletionTime?: any | null;
        description?: string | null;
        dueDate?: any | null;
        id: string;
        priority?: "low" | "medium" | "high" | null;
        project: {
          archived: boolean;
          createdAt: any;
          description?: string | null;
          id: string;
          isPublic: boolean;
          name: string;
          ownerId: string;
        } | null;
        projectId?: string | null;
        tags: Array<{
          color: string;
          createdAt: any;
          createdBy: string;
          id: string;
          name: string;
        }>;
        title: string;
        user: {
          createdAt: any;
          email: string;
          id: string;
          image?: string | null;
          name?: string;
        };
        userId: string;
      } | null
    >;
    list: FunctionReference<
      "query",
      "public",
      {
        completed?: boolean;
        cursor?: string | null;
        limit?: number;
        priority?: "low" | "medium" | "high";
        projectId?: string;
        showDeleted?: boolean;
      },
      {
        continueCursor: string | null;
        isDone: boolean;
        page: Array<{
          completed: boolean;
          createdAt: any;
          deletionTime?: any | null;
          description?: string | null;
          dueDate?: any | null;
          id: string;
          priority?: "low" | "medium" | "high" | null;
          project: {
            archived: boolean;
            createdAt: any;
            description?: string | null;
            id: string;
            isPublic: boolean;
            name: string;
            ownerId: string;
          } | null;
          projectId?: string | null;
          tags: Array<{
            color: string;
            createdAt: any;
            createdBy: string;
            id: string;
            name: string;
          }>;
          title: string;
          userId: string;
        }>;
      }
    >;
    restore: FunctionReference<"mutation", "public", { id: string }, any>;
    search: FunctionReference<
      "query",
      "public",
      {
        completed?: boolean;
        cursor?: string | null;
        limit?: number;
        projectId?: string;
        query: string;
        showDeleted?: boolean;
      },
      {
        continueCursor: string | null;
        isDone: boolean;
        page: Array<{
          completed: boolean;
          createdAt: any;
          deletionTime?: any | null;
          description?: string | null;
          dueDate?: any | null;
          id: string;
          priority?: "low" | "medium" | "high" | null;
          project: {
            archived: boolean;
            createdAt: any;
            description?: string | null;
            id: string;
            isPublic: boolean;
            name: string;
            ownerId: string;
          } | null;
          projectId?: string | null;
          tags: Array<{
            color: string;
            createdAt: any;
            createdBy: string;
            id: string;
            name: string;
          }>;
          title: string;
          userId: string;
        }>;
      }
    >;
    toggleComplete: FunctionReference<
      "mutation",
      "public",
      { id: string },
      boolean
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        description?: string;
        dueDate?: any | null;
        id: string;
        priority?: "low" | "medium" | "high" | null;
        projectId?: string | null;
        tagIds?: Array<string>;
        title?: string;
      },
      any
    >;
  };
  user: {
    getCurrentUser: FunctionReference<
      "query",
      "public",
      {},
      {
        activeOrganization: {
          id: string;
          logo?: string | null;
          name: string;
          role: string;
          slug: string;
        } | null;
        id: string;
        image?: string | null;
        isAdmin: boolean;
        name?: string;
        personalOrganizationId?: string | null;
        plan?: string;
      } | null
    >;
    getIsAuthenticated: FunctionReference<"query", "public", {}, boolean>;
    getSessionUser: FunctionReference<
      "query",
      "public",
      {},
      {
        activeOrganization: {
          id: string;
          logo?: string | null;
          name: string;
          role: string;
          slug: string;
        } | null;
        id: string;
        image?: string | null;
        isAdmin: boolean;
        name?: string;
        personalOrganizationId?: string | null;
        plan?: string;
      } | null
    >;
    updateSettings: FunctionReference<
      "mutation",
      "public",
      { bio?: string; name?: string },
      { success: boolean }
    >;
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  email: {
    sendOrganizationInviteEmail: FunctionReference<
      "action",
      "internal",
      {
        acceptUrl: string;
        invitationId: string;
        inviterEmail: string;
        inviterName: string;
        organizationName: string;
        role: string;
        to: string;
      },
      string
    >;
  };
  generated: {
    auth: {
      beforeCreate: FunctionReference<
        "mutation",
        "internal",
        { data: any; model: string },
        any
      >;
      beforeDelete: FunctionReference<
        "mutation",
        "internal",
        { doc: any; model: string },
        any
      >;
      beforeUpdate: FunctionReference<
        "mutation",
        "internal",
        { doc: any; model: string; update: any },
        any
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          beforeCreateHandle?: string;
          input: { data: any; model: string };
          onCreateHandle?: string;
          select?: Array<string>;
        },
        any
      >;
      deleteMany: FunctionReference<
        "mutation",
        "internal",
        {
          beforeDeleteHandle?: string;
          input: { model: string; where?: Array<any> };
          onDeleteHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      deleteOne: FunctionReference<
        "mutation",
        "internal",
        {
          beforeDeleteHandle?: string;
          input: { model: string; where?: Array<any> };
          onDeleteHandle?: string;
        },
        any
      >;
      findMany: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          limit?: number;
          model: string;
          offset?: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          sortBy?: { direction: "asc" | "desc"; field: string };
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any
      >;
      findOne: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          model: string;
          select?: Array<string>;
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any
      >;
      getLatestJwks: FunctionReference<"action", "internal", {}, any>;
      onCreate: FunctionReference<
        "mutation",
        "internal",
        { doc: any; model: string },
        any
      >;
      onDelete: FunctionReference<
        "mutation",
        "internal",
        { doc: any; model: string },
        any
      >;
      onUpdate: FunctionReference<
        "mutation",
        "internal",
        { model: string; newDoc: any; oldDoc: any },
        any
      >;
      rotateKeys: FunctionReference<"action", "internal", {}, any>;
      updateMany: FunctionReference<
        "mutation",
        "internal",
        {
          beforeUpdateHandle?: string;
          input: { model: string; update: any; where?: Array<any> };
          onUpdateHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      updateOne: FunctionReference<
        "mutation",
        "internal",
        {
          beforeUpdateHandle?: string;
          input: { model: string; update: any; where?: Array<any> };
          onUpdateHandle?: string;
        },
        any
      >;
    };
    server: {
      scheduledDelete: FunctionReference<"mutation", "internal", any, any>;
      scheduledMutationBatch: FunctionReference<
        "mutation",
        "internal",
        any,
        any
      >;
    };
  };
  init: {
    default: FunctionReference<"mutation", "internal", {}, any>;
  };
  organization: {
    createPersonalOrganization: FunctionReference<
      "mutation",
      "internal",
      { image?: string | null; name: string; userId: string },
      { id: string; slug: string } | null
    >;
  };
  polarCustomer: {
    createCustomer: FunctionReference<
      "action",
      "internal",
      { email: string; name?: string; userId: string },
      any
    >;
    updateUserPolarCustomerId: FunctionReference<
      "mutation",
      "internal",
      { customerId: string; userId: string },
      any
    >;
  };
  polarSubscription: {
    createSubscription: FunctionReference<
      "mutation",
      "internal",
      {
        subscription: {
          amount?: number | null;
          cancelAtPeriodEnd: boolean;
          checkoutId?: string | null;
          createdAt: string;
          currency?: string | null;
          currentPeriodEnd?: string | null;
          currentPeriodStart: string;
          customerCancellationComment?: string | null;
          customerCancellationReason?: string | null;
          endedAt?: string | null;
          metadata: Record<string, any>;
          modifiedAt?: string | null;
          organizationId: string;
          priceId?: string;
          productId: string;
          recurringInterval?: string | null;
          startedAt?: string | null;
          status: string;
          subscriptionId: string;
          userId: string;
        };
      },
      any
    >;
    getActiveSubscription: FunctionReference<
      "query",
      "internal",
      { userId: string },
      {
        cancelAtPeriodEnd: boolean;
        currentPeriodEnd?: string | null;
        subscriptionId: string;
      } | null
    >;
    updateSubscription: FunctionReference<
      "mutation",
      "internal",
      {
        subscription: {
          amount?: number | null;
          cancelAtPeriodEnd: boolean;
          checkoutId?: string | null;
          createdAt: string;
          currency?: string | null;
          currentPeriodEnd?: string | null;
          currentPeriodStart: string;
          customerCancellationComment?: string | null;
          customerCancellationReason?: string | null;
          endedAt?: string | null;
          metadata: Record<string, any>;
          modifiedAt?: string | null;
          organizationId: string;
          priceId?: string;
          productId: string;
          recurringInterval?: string | null;
          startedAt?: string | null;
          status: string;
          subscriptionId: string;
          userId: string;
        };
      },
      { periodChanged: boolean; subscriptionEnded: boolean; updated: boolean }
    >;
  };
  reset: {
    deleteTable: FunctionReference<
      "mutation",
      "internal",
      { cursor: string | null; tableName: string },
      any
    >;
    reset: FunctionReference<"action", "internal", {}, any>;
  };
  seed: {
    cleanupSeedData: FunctionReference<"mutation", "internal", {}, any>;
    generateSamplesBatch: FunctionReference<
      "mutation",
      "internal",
      { batchIndex: number; count: number; userId: string },
      { created: number; todosCreated: number }
    >;
    seed: FunctionReference<"mutation", "internal", {}, any>;
    seedUsers: FunctionReference<"mutation", "internal", {}, Array<string>>;
  };
  todoComments: {
    cleanupOrphanedComments: FunctionReference<
      "mutation",
      "internal",
      { batchSize?: number },
      { deleted: number; hasMore: boolean }
    >;
  };
  todoInternal: {
    archiveOldCompletedTodos: FunctionReference<
      "mutation",
      "internal",
      { batchSize?: number; daysOld?: number },
      { archived: number; hasMore: boolean }
    >;
    create: FunctionReference<
      "mutation",
      "internal",
      {
        description?: string;
        priority?: "low" | "medium" | "high";
        title: string;
        userId: string;
      },
      string
    >;
    deleteTodo: FunctionReference<
      "mutation",
      "internal",
      { id: string; userId: string },
      any
    >;
    generateWeeklyReport: FunctionReference<
      "action",
      "internal",
      { userId: string },
      {
        insights: Array<string>;
        stats: {
          mostProductiveDay: string | null;
          projectsWorkedOn: number;
          todosCompleted: number;
          todosCreated: number;
        };
        week: { end: number; start: number };
      }
    >;
    getSystemStats: FunctionReference<
      "query",
      "internal",
      {},
      {
        activity: {
          commentsToday: number;
          todosCompletedToday: number;
          todosCreatedToday: number;
        };
        projects: { active: number; public: number; total: number };
        todos: {
          byPriority: Record<string, number>;
          completed: number;
          overdue: number;
          total: number;
        };
        users: { active30d: number; total: number; withTodos: number };
      }
    >;
    getUsersWithOverdueTodos: FunctionReference<
      "query",
      "internal",
      { hoursOverdue?: number; limit?: number },
      Array<{
        email: string;
        name?: string;
        overdueTodos: Array<{
          daysOverdue: number;
          dueDate: any;
          id: string;
          title: string;
        }>;
        userId: string;
      }>
    >;
    getUserWeeklyActivity: FunctionReference<
      "query",
      "internal",
      { userId: string; weekStart: number },
      { all: Array<any>; completed: Array<any>; created: Array<any> }
    >;
    processDailySummaries: FunctionReference<
      "action",
      "internal",
      {},
      { failed: number; processed: number; sent: number }
    >;
    recalculateUserStats: FunctionReference<
      "mutation",
      "internal",
      { userId: string },
      { completedTodos: number; streak: number; totalTodos: number }
    >;
    update: FunctionReference<
      "mutation",
      "internal",
      {
        completed?: boolean;
        description?: string;
        id: string;
        title?: string;
        userId: string;
      },
      any
    >;
    updateOverduePriorities: FunctionReference<
      "mutation",
      "internal",
      { batchSize?: number },
      { hasMore: boolean; updated: number }
    >;
  };
};

export declare const components: {
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
      getValue: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          key?: string;
          name: string;
          sampleShards?: number;
        },
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          shard: number;
          ts: number;
          value: number;
        }
      >;
      rateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      resetRateLimit: FunctionReference<
        "mutation",
        "internal",
        { key?: string; name: string },
        null
      >;
    };
    time: {
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
    };
  };
  resend: {
    lib: {
      cancelEmail: FunctionReference<
        "mutation",
        "internal",
        { emailId: string },
        null
      >;
      cleanupAbandonedEmails: FunctionReference<
        "mutation",
        "internal",
        { olderThan?: number },
        null
      >;
      cleanupOldEmails: FunctionReference<
        "mutation",
        "internal",
        { olderThan?: number },
        null
      >;
      createManualEmail: FunctionReference<
        "mutation",
        "internal",
        {
          from: string;
          headers?: Array<{ name: string; value: string }>;
          replyTo?: Array<string>;
          subject: string;
          to: Array<string> | string;
        },
        string
      >;
      get: FunctionReference<
        "query",
        "internal",
        { emailId: string },
        {
          bcc?: Array<string>;
          bounced?: boolean;
          cc?: Array<string>;
          clicked?: boolean;
          complained: boolean;
          createdAt: number;
          deliveryDelayed?: boolean;
          errorMessage?: string;
          failed?: boolean;
          finalizedAt: number;
          from: string;
          headers?: Array<{ name: string; value: string }>;
          html?: string;
          opened: boolean;
          replyTo: Array<string>;
          resendId?: string;
          segment: number;
          status:
            | "waiting"
            | "queued"
            | "cancelled"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
          subject?: string;
          template?: {
            id: string;
            variables?: Record<string, string | number>;
          };
          text?: string;
          to: Array<string>;
        } | null
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { emailId: string },
        {
          bounced: boolean;
          clicked: boolean;
          complained: boolean;
          deliveryDelayed: boolean;
          errorMessage: string | null;
          failed: boolean;
          opened: boolean;
          status:
            | "waiting"
            | "queued"
            | "cancelled"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
        } | null
      >;
      handleEmailEvent: FunctionReference<
        "mutation",
        "internal",
        { event: any },
        null
      >;
      sendEmail: FunctionReference<
        "mutation",
        "internal",
        {
          bcc?: Array<string>;
          cc?: Array<string>;
          from: string;
          headers?: Array<{ name: string; value: string }>;
          html?: string;
          options: {
            apiKey: string;
            initialBackoffMs: number;
            onEmailEvent?: { fnHandle: string };
            retryAttempts: number;
            testMode: boolean;
          };
          replyTo?: Array<string>;
          subject?: string;
          template?: {
            id: string;
            variables?: Record<string, string | number>;
          };
          text?: string;
          to: Array<string>;
        },
        string
      >;
      updateManualEmail: FunctionReference<
        "mutation",
        "internal",
        {
          emailId: string;
          errorMessage?: string;
          resendId?: string;
          status:
            | "waiting"
            | "queued"
            | "cancelled"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
        },
        null
      >;
    };
  };
  aggregateUsers: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  aggregateTodosByUser: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  aggregateTodosByProject: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  aggregateTodosByStatus: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  aggregateTagUsage: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  aggregateProjectMembers: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  aggregateCommentsByTodo: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  aggregateRepliesByParent: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
};
