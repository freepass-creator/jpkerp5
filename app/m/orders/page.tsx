import { redirect } from 'next/navigation';

/**
 * /m/orders 기본 진입 → 받은 업무로 리다이렉트.
 * 받은/보낸은 완전 분리된 페이지 (탭 폐기).
 */
export default function OrdersRedirect() {
  redirect('/m/orders/received');
}
