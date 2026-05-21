import { AdminGate } from '@/components/auth/admin-gate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
