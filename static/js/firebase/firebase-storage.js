import {
  getDownloadURL,
  ref,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';
import { storage } from './firebase-config.js';

export async function uploadProductImage(file, uid) {
  const path = `product-images/${uid}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}


export async function uploadContractFile(file, uid) {
  const safeUid = uid || 'unknown';
  const path = `contract-files/${safeUid}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
