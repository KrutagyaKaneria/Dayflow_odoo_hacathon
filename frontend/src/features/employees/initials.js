// Shared by ProfileHeader (Phase 04) and the directory's EmployeeCard (Phase 05).
export function initials(name) {
  return (name || '')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
