---
name: toast
description: Toast notifications with Sonner for user feedback. Use for success/error messages, async operation feedback, and temporary notifications. Always use when using Sonner.
---

# Toast Notifications

## Context

- When displaying temporary notifications to users
- For success, error, or informational messages
- For async operation feedback
- DO NOT overuse toasts, follow the standard UX patterns

## Requirements

- Import toast from 'sonner' package
- Use toast.promise() for async operations with loading/success/error states
- Use direct toast methods for immediate notifications
- Keep messages concise and informative

## Examples

<example>
// For async operations
const promise = someAsyncOperation();

toast.promise(promise, {
loading: 'Operation in progress...',
success: 'Operation successful!',
error: 'Operation failed.',
});
</example>

<example>
// For immediate notifications
toast.success('Action completed successfully!');
toast.error('An error occurred.');
toast.info('Here's some information.');
</example>

<example type="invalid">
// Don't create custom toast implementations
const showToast = (message) => {
  const toastElement = document.createElement('div');
  toastElement.innerText = message;
  document.body.appendChild(toastElement);
  setTimeout(() => toastElement.remove(), 3000);
};
</example>

<example type="invalid">
// Don't use alert() for notifications
alert('Operation successful!');
</example>
