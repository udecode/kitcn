import { isRlsRole, RlsRole, rlsRole } from './roles';

test('RlsRole stores config flags and supports existing()', () => {
  const role = new RlsRole('admin', {
    createDb: true,
    createRole: false,
    inherit: true,
  });

  expect(role.name).toBe('admin');
  expect(role.createDb).toBe(true);
  expect(role.createRole).toBe(false);
  expect(role.inherit).toBe(true);
  expect((role as any)._existing).toBeUndefined();

  const returned = role.existing();
  expect(returned).toBe(role);
  expect((role as any)._existing).toBe(true);
});

test('rlsRole factory and isRlsRole type guard', () => {
  const role = rlsRole('reader');
  expect(role).toBeInstanceOf(RlsRole);
  expect(isRlsRole(role)).toBe(true);
  expect(isRlsRole({ name: 'reader' })).toBe(false);
  expect(isRlsRole(null)).toBe(false);
});
