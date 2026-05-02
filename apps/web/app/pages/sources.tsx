import { Navigate } from 'react-router';

/** Legacy `/sources` URL — all management moved to `/settings` (Sources section). */
export default function SourcesRedirect() {
  return <Navigate to="/settings#sources" replace />;
}
