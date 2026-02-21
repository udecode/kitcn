'use client';

import type { ApiInputs } from '@convex/types';
import { skipToken, useMutation, useQuery } from '@tanstack/react-query';
import {
  Ban,
  Calendar,
  CreditCard,
  Crown,
  Edit3,
  Settings,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/convex/auth-client';
import { useCRPC } from '@/lib/convex/crpc';

type OrganizationOverviewProps = {
  onManageMembersAction?: () => void;
  slug: string;
};

export function OrganizationOverview({
  onManageMembersAction,
  slug,
}: OrganizationOverviewProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editData, setEditData] = useState({
    name: '',
    slug: '',
    logo: '',
  });

  const router = useRouter();
  const crpc = useCRPC();

  // Lazy state initialization - only runs once on mount
  const [now] = useState(() => Date.now());

  // Fetch organization data
  const { data: organization } = useQuery(
    crpc.organization.getOrganizationOverview.queryOptions(
      { slug },
      { skipUnauth: true }
    )
  );

  // Subscription query
  const subscriptionQuery = useQuery(
    crpc.polarSubscription.getOrganizationSubscription.queryOptions(
      organization?.id ? { organizationId: organization.id } : skipToken
    )
  );
  const subscription = subscriptionQuery.data;

  const updateOrganization = useMutation(
    crpc.organization.updateOrganization.mutationOptions({
      meta: { errorMessage: 'Failed to update organization' },
    })
  );

  const deleteOrganization = useMutation(
    crpc.organization.deleteOrganization.mutationOptions({
      meta: { errorMessage: 'Failed to delete organization' },
      onSuccess: () => {
        setShowDeleteDialog(false);
        toast.success('Organization deleted successfully');
        router.push('/');
      },
    })
  );

  const forbiddenOrgApi = useMutation({
    mutationFn: async () => {
      const response = await authClient.organization.listMembers({
        query: { organizationId: 'forbidden-organization-id' },
        fetchOptions: {
          throw: false,
        },
      });
      if (response.error) {
        throw new Error(response.error.message);
      }
    },
  });

  if (!organization) {
    return null;
  }

  const handleEditOrganization = () => {
    setEditData({
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo || '',
    });
    setShowEditDialog(true);
  };

  const handleUpdateOrganization = async () => {
    if (!editData.name.trim()) {
      toast.error('Organization name is required');
      return;
    }

    const data: Omit<
      ApiInputs['organization']['updateOrganization'],
      'organizationId'
    > = {};
    if (editData.name !== organization.name) {
      data.name = editData.name.trim();
    }
    if (editData.slug !== organization.slug && editData.slug.trim()) {
      data.slug = editData.slug.trim();
    }
    if (editData.logo !== (organization.logo || '') && editData.logo.trim()) {
      data.logo = editData.logo.trim();
    }

    if (Object.keys(data).length === 0) {
      toast.error('No changes detected');
      return;
    }

    const nextSlug = data.slug;
    updateOrganization.mutate(
      { organizationId: organization.id, ...data },
      {
        onSuccess: () => {
          setShowEditDialog(false);
          toast.success('Organization updated successfully');
          if (nextSlug) {
            router.push(`/org/${encodeURIComponent(nextSlug)}`);
          }
        },
      }
    );
  };

  const handleDeleteOrganization = () => {
    deleteOrganization.mutate({ organizationId: organization.id });
  };

  const isOwner = organization.role === 'owner';
  const canEdit = isOwner && !organization.isPersonal;
  const daysActive = Math.floor(
    (now - organization.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const handleManageSubscription = async () => {
    try {
      if (subscription) {
        // Has subscription - open customer portal
        await authClient.customer.portal();
      } else {
        // No subscription - checkout
        await authClient.checkout({
          slug: 'premium',
          referenceId: organization.id,
        });
      }
    } catch (error) {
      console.error('Subscription error:', error);
      toast.error('Failed to manage subscription');
    }
  };

  return (
    <div className="space-y-8">
      {/* Organization Info */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
            Organization Details
          </h2>
          {canEdit && (
            <Button onClick={handleEditOrganization} size="sm" variant="ghost">
              <Edit3 className="h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
        <div className="grid @xl:grid-cols-2 gap-4 rounded-lg bg-secondary/30 p-4">
          <div>
            <p className="text-muted-foreground text-xs">Name</p>
            <p className="font-medium text-sm">{organization.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Slug</p>
            <p className="font-medium font-mono text-sm">{organization.slug}</p>
          </div>
          <div>
            <p className="mb-1 text-muted-foreground text-xs">Type</p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {organization.isPersonal ? 'Personal' : 'Team'}
              </Badge>
              {organization.isActive && (
                <Badge variant="secondary">Active</Badge>
              )}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Created</p>
            <p className="font-medium text-sm">
              {new Date(organization.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>
      </section>

      {/* Organization Stats */}
      <section>
        <h2 className="mb-4 font-medium text-muted-foreground text-sm uppercase tracking-wide">
          Stats
        </h2>
        <div className="grid @xl:grid-cols-3 gap-3">
          <div className="flex items-center gap-3 rounded-lg bg-secondary/30 p-4">
            <div className="rounded-full bg-primary/10 p-2">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-2xl">{organization.membersCount}</p>
              <p className="text-muted-foreground text-sm">
                Member{organization.membersCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-secondary/30 p-4">
            <div className="rounded-full bg-green-500/10 p-2">
              <Crown className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-bold text-2xl capitalize">
                {organization.role || 'Member'}
              </p>
              <p className="text-muted-foreground text-sm">Your Role</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-secondary/30 p-4">
            <div className="rounded-full bg-blue-500/10 p-2">
              <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-bold text-2xl">{daysActive}</p>
              <p className="text-muted-foreground text-sm">Days Active</p>
            </div>
          </div>
        </div>
      </section>

      {/* Billing */}
      {isOwner && (
        <section>
          <h2 className="mb-4 font-medium text-muted-foreground text-sm uppercase tracking-wide">
            Billing
          </h2>
          <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-purple-500/10 p-2">
                <CreditCard className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="font-medium text-sm">
                  {subscription ? 'Premium Plan' : 'Free Plan'}
                </p>
                <p className="text-muted-foreground text-xs">
                  {subscription
                    ? subscription.cancelAtPeriodEnd
                      ? `Cancels ${subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'soon'}`
                      : `Renews ${subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'soon'}`
                    : 'Upgrade to unlock premium features'}
                </p>
              </div>
            </div>
            <Button
              onClick={handleManageSubscription}
              size="sm"
              variant="secondary"
            >
              {subscription ? 'Manage' : 'Upgrade'}
            </Button>
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <section>
        <h2 className="mb-4 font-medium text-muted-foreground text-sm uppercase tracking-wide">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-2">
          {isOwner && (
            <>
              <Button
                className="justify-start"
                onClick={onManageMembersAction}
                size="sm"
                variant="secondary"
              >
                <UserCheck className="h-4 w-4" />
                Manage Members
              </Button>
              <Button
                className="justify-start"
                disabled={forbiddenOrgApi.isPending}
                onClick={() => forbiddenOrgApi.mutate()}
                size="sm"
                variant="secondary"
              >
                <Ban className="h-4 w-4" />
                {forbiddenOrgApi.isPending
                  ? 'Triggering error...'
                  : 'Trigger Forbidden Org API'}
              </Button>
              <Button
                className="justify-start"
                onClick={handleEditOrganization}
                size="sm"
                variant="secondary"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Danger Zone */}
      {canEdit && (
        <section className="rounded-lg bg-destructive/5 p-4">
          <h2 className="mb-2 font-medium text-destructive text-sm">
            Danger Zone
          </h2>
          <p className="mb-4 text-muted-foreground text-sm">
            Irreversible and destructive actions
          </p>
          <Button
            onClick={() => setShowDeleteDialog(true)}
            size="sm"
            variant="destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete Organization
          </Button>
        </section>
      )}

      {/* Edit Organization Dialog */}
      <Dialog onOpenChange={setShowEditDialog} open={showEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>
              Update your organization details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                onChange={(e) =>
                  setEditData({ ...editData, name: e.target.value })
                }
                value={editData.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input
                id="edit-slug"
                onChange={(e) =>
                  setEditData({ ...editData, slug: e.target.value })
                }
                placeholder="organization-slug"
                value={editData.slug}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-logo">Logo URL</Label>
              <Input
                id="edit-logo"
                onChange={(e) =>
                  setEditData({ ...editData, logo: e.target.value })
                }
                placeholder="https://example.com/logo.png"
                value={editData.logo}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowEditDialog(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={updateOrganization.isPending}
              onClick={handleUpdateOrganization}
              variant="secondary"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Dialog */}
      <Dialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Organization</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the
              organization and all of its data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowDeleteDialog(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={deleteOrganization.isPending}
              onClick={handleDeleteOrganization}
              variant="destructive"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
