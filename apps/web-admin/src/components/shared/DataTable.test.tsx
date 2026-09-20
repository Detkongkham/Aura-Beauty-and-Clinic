import type { ColumnDef } from '@tanstack/react-table';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/test-utils';

import { DataTable } from './DataTable';

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
];

describe('DataTable', () => {
  it('renders rows from data', () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        data={[
          { id: '1', name: 'Alpha' },
          { id: '2', name: 'Beta' },
        ]}
        getRowId={(r) => r.id}
      />,
      { withRouter: false },
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows an empty state when there are no rows', () => {
    renderWithProviders(
      <DataTable columns={columns} data={[]} emptyTitle="Nothing here" />,
      { withRouter: false },
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders skeleton rows while loading', () => {
    const { container } = renderWithProviders(
      <DataTable columns={columns} data={[]} loading skeletonRows={3} />,
      { withRouter: false },
    );
    expect(container.querySelectorAll('.animate-pulse').length).toBe(3);
  });
});
