import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { NormalizedApiError } from '@/services/apiError';

/** `errorElement` for the router — shown when a loader/render throws. */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { t } = useTranslation();

  let title = 'ເກີດຂໍ້ຜິດພາດ';
  let detail = '';

  if (isRouteErrorResponse(error)) {
    title = `${error.status}`;
    detail = error.statusText;
  } else if (error instanceof NormalizedApiError) {
    title = error.code;
    detail = error.message;
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive-soft text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl">{title}</h1>
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => navigate(0)}>{t('common.loading')}</Button>
      </div>
    </div>
  );
}
