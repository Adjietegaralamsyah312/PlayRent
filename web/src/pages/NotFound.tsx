import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/Feedback';
import { Button } from '../components/Button';
import { homeFor } from './Login';
import { useAuth } from '../lib/auth';

export function NotFound() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <EmptyState
      icon={<Compass className="size-8" aria-hidden="true" />}
      title="Halaman tidak ditemukan"
      description="Alamat yang Anda buka tidak ada atau sudah dipindahkan."
      primaryAction={
        <Button onClick={() => navigate(user ? homeFor(user.role) : '/masuk', { replace: true })}>
          {user ? 'Kembali ke beranda' : 'Masuk'}
        </Button>
      }
    />
  );
}
