import 'server-only';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getAdminRtdb } from './admin';

/**
 * Firebase Admin Auth — ID token 검증용. getAdminRtdb() 가 app 초기화하므로 같은 app 재사용.
 */

let _auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  // getAdminRtdb 가 admin app 을 초기화해줌
  getAdminRtdb();
  _auth = getAuth();
  return _auth;
}
