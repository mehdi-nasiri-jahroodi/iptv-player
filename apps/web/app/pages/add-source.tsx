import { Navigate } from 'react-router';

/** Legacy full-page add flow — sources are added from Settings in a modal. */
export default function AddSourceRedirect() {
  return <Navigate to="/settings?addSource=1#sources" replace />;
}
