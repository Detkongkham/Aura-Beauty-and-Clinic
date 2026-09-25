import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useStaffList } from '@/features/staff/staff.api';
import { ROUTES } from '@/router/paths';

import { useService } from './services.api';

export function ServiceDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useService(id);
  const { data: staffPage } = useStaffList({ page: 1, pageSize: 100 });

  const linkedStaff = (staffPage?.items ?? []).filter((s) => id && s.serviceIds.includes(id));

  if (isError) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to={ROUTES.services}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('nav.services')}
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">{t('services.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm">
        <Link to={ROUTES.services}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('nav.services')}
        </Link>
      </Button>

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <PageHeader
            title={data.name}
            description={data.categoryName}
            actions={
              data.isActive ? (
                <Badge variant="success">{t('services.active')}</Badge>
              ) : (
                <Badge variant="neutral">{t('services.inactive')}</Badge>
              )
            }
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>{t('services.name')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row
                  label={t('services.price')}
                  value={<CurrencyText amount={data.price} currency={data.currency} />}
                />
                <Row label={t('services.duration')} value={`${data.durationMinutes}′`} />
                <Row
                  label={t('services.requireDeposit')}
                  value={
                    data.requireDeposit ? (
                      <CurrencyText amount={data.depositAmount} currency={data.currency} />
                    ) : (
                      '–'
                    )
                  }
                />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t('services.bom')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.consumables.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('services.bomEmpty')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('services.bomProduct')}</TableHead>
                        <TableHead className="text-right">{t('services.bomQty')}</TableHead>
                        <TableHead>{t('services.bomUnit')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.consumables.map((c) => (
                        <TableRow key={c.productId} className="h-10">
                          <TableCell>{c.productName}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.qtyPerUse}</TableCell>
                          <TableCell>
                            {c.uomCode && c.factorToBase !== 1 ? (
                              <>
                                {c.uomCode}
                                <span className="ml-1 text-xs tabular-nums text-muted-foreground">
                                  (= {c.baseQtyPerUse} {c.unit})
                                </span>
                              </>
                            ) : (
                              c.unit
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('services.linkedStaff')}</CardTitle>
            </CardHeader>
            <CardContent>
              {linkedStaff.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('staff.noServices')}</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {linkedStaff.map((s) => (
                    <li key={s.id}>
                      <Link to={ROUTES.staffDetail(s.id)}>
                        <Badge variant="neutral">{s.name}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
