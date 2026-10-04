import React, { useEffect, useState } from 'react';
import { Bus, Map, Users, Plus, BarChart3, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useTableParams } from '../../hooks/useTableParams';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Button } from '../../components/ui/Button';
import { PageHeader, ErrorState, Tabs, IncompleteNotice } from '../../components/ui';
import { formatCurrency, formatDate } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { VehicleModal, VehicleFormValues } from './VehicleModal';
import { RouteModal, RouteFormValues } from './RouteModal';
import { AssignmentModal, AssignmentFormValues, AssignmentEditTarget, RouteOption, VehicleOption } from './AssignmentModal';
import { RouteStopsDrawer } from './RouteStopsDrawer';
import { VehicleLocationModal } from './VehicleLocationModal';
import { RouteReport } from './RouteReport';
import { TransportFees } from './TransportFees';
import { StopsChips } from './StopsChips';

interface VehicleType {
  id: string;
  registrationNumber: string;
  capacity: number;
  driverName: string;
  driverPhone: string | null;
  isActive: boolean;
  // Wave C — last-known position (manual entry today; GPS device later).
  lastLat?: number | null;
  lastLng?: number | null;
  lastLocationAt?: string | null;
}

interface RouteType {
  id: string;
  name: string;
  stops: string;
  startPoint?: string | null;
  endPoint?: string | null;
  distance?: string | null;
  vehicleId: string | null;
  routeFare: number | string;
  isActive: boolean;
  _count?: { stopPoints: number; assignments: number };
}

interface AssignmentType {
  id: string;
  routeId: string;
  vehicleId: string;
  stopId?: string | null;
  stop?: { id: string; name: string; sequence: number; pickupTime: string | null } | null;
  pickupPoint: string | null;
  assignedAt: string;
  student?: { firstName: string; lastName: string; studentId: string };
  route?: { name: string; routeFare: number | string };
  vehicle?: { registrationNumber: string };
}

export default function TransportManagement() {
  const [activeTab, setActiveTab] = useState<'vehicles' | 'routes' | 'assignments' | 'reports' | 'fees'>('vehicles');
  // Fee billing creates invoices — SUPER_ADMIN / ADMIN only (backend BILLING_ROLES).
  const role = useAuthStore((st) => st.user?.role);
  const canBill = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const [stopsRoute, setStopsRoute] = useState<RouteType | null>(null);
  const [locationVehicle, setLocationVehicle] = useState<VehicleType | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<AssignmentEditTarget | null>(null);
  const [assignmentToDelete, setAssignmentToDelete] = useState<AssignmentType | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);

  // ---- Vehicles ----
  const vehiclesParams = useTableParams(10);
  const [vehicles, setVehicles] = useState<VehicleType[]>([]);
  const [vehiclesTotal, setVehiclesTotal] = useState(0);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehiclesError, setVehiclesError] = useState(false);
  const [allVehicles, setAllVehicles] = useState<VehicleOption[]>([]);

  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleType | null>(null);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<VehicleType | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState(false);

  // ---- Routes ----
  const routesParams = useTableParams(10);
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [routesTotal, setRoutesTotal] = useState(0);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState(false);
  const [allRoutes, setAllRoutes] = useState<RouteOption[]>([]);

  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteType | null>(null);
  const [savingRoute, setSavingRoute] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<RouteType | null>(null);
  const [deletingRoute, setDeletingRoute] = useState(false);

  // ---- Assignments ----
  const assignmentsParams = useTableParams(10);
  const [assignments, setAssignments] = useState<AssignmentType[]>([]);
  const [assignmentsTotal, setAssignmentsTotal] = useState(0);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState(false);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);

  const fetchVehicles = async () => {
    setVehiclesLoading(true);
    setVehiclesError(false);
    try {
      const res = await apiClient.get('/transport/vehicles', {
        params: { page: vehiclesParams.params.page, pageSize: vehiclesParams.params.pageSize, search: vehiclesParams.debouncedSearch || undefined },
      });
      setVehicles(res.data.data?.vehicles || res.data.data || []);
      setVehiclesTotal(res.data.meta?.total || res.data.data?.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch vehicles:', err);
      setVehiclesError(true);
      toast.error(err.response?.data?.message || 'Failed to load vehicles');
    } finally {
      setVehiclesLoading(false);
    }
  };

  const fetchAllVehicles = async () => {
    try {
      const res = await apiClient.get('/transport/vehicles', { params: { page: 1, pageSize: 200 } });
      setAllVehicles(res.data.data?.vehicles || res.data.data || []);
    } catch {
      setAllVehicles([]);
    }
  };

  const fetchRoutes = async () => {
    setRoutesLoading(true);
    setRoutesError(false);
    try {
      const res = await apiClient.get('/transport/routes', {
        params: { page: routesParams.params.page, pageSize: routesParams.params.pageSize, search: routesParams.debouncedSearch || undefined },
      });
      setRoutes(res.data.data?.routes || res.data.data || []);
      setRoutesTotal(res.data.meta?.total || res.data.data?.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch routes:', err);
      setRoutesError(true);
      toast.error(err.response?.data?.message || 'Failed to load routes');
    } finally {
      setRoutesLoading(false);
    }
  };

  const fetchAllRoutes = async () => {
    try {
      const res = await apiClient.get('/transport/routes', { params: { page: 1, pageSize: 200 } });
      setAllRoutes(res.data.data?.routes || res.data.data || []);
    } catch {
      setAllRoutes([]);
    }
  };

  const fetchAssignments = async () => {
    setAssignmentsLoading(true);
    setAssignmentsError(false);
    try {
      const res = await apiClient.get('/transport/assignments', {
        params: { page: assignmentsParams.params.page, pageSize: assignmentsParams.params.pageSize, search: assignmentsParams.debouncedSearch || undefined },
      });
      setAssignments(res.data.data?.assignments || res.data.data || []);
      setAssignmentsTotal(res.data.meta?.total || res.data.data?.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch assignments:', err);
      setAssignmentsError(true);
      toast.error(err.response?.data?.message || 'Failed to load assignments');
    } finally {
      setAssignmentsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'vehicles') fetchVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, vehiclesParams.params.page, vehiclesParams.params.pageSize, vehiclesParams.debouncedSearch]);

  useEffect(() => {
    if (activeTab === 'routes') fetchRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, routesParams.params.page, routesParams.params.pageSize, routesParams.debouncedSearch]);

  useEffect(() => {
    if (activeTab === 'assignments') fetchAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, assignmentsParams.params.page, assignmentsParams.params.pageSize, assignmentsParams.debouncedSearch]);

  useEffect(() => {
    fetchAllVehicles();
    fetchAllRoutes();
  }, []);

  // ---- Vehicle CRUD ----
  const openAddVehicle = () => { setEditingVehicle(null); setVehicleModalOpen(true); };
  const openEditVehicle = (v: VehicleType) => { setEditingVehicle(v); setVehicleModalOpen(true); };

  const handleSaveVehicle = async (values: VehicleFormValues) => {
    setSavingVehicle(true);
    try {
      if (editingVehicle) {
        await apiClient.put(`/transport/vehicles/${editingVehicle.id}`, values);
        toast.success('Vehicle updated successfully');
      } else {
        await apiClient.post('/transport/vehicles', values);
        toast.success('Vehicle added successfully');
      }
      setVehicleModalOpen(false);
      setEditingVehicle(null);
      fetchVehicles();
      fetchAllVehicles();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to ${editingVehicle ? 'update' : 'add'} vehicle`);
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleConfirmDeleteVehicle = async () => {
    if (!vehicleToDelete) return;
    setDeletingVehicle(true);
    try {
      await apiClient.delete(`/transport/vehicles/${vehicleToDelete.id}`);
      toast.success('Vehicle deleted successfully');
      setVehicleToDelete(null);
      fetchVehicles();
      fetchAllVehicles();
    } catch (err: any) {
      // 409 Conflict: vehicle referenced by existing assignments.
      toast.error(err.response?.data?.message || 'Failed to delete vehicle');
    } finally {
      setDeletingVehicle(false);
    }
  };

  // ---- Route CRUD ----
  const openAddRoute = () => { setEditingRoute(null); setRouteModalOpen(true); };
  const openEditRoute = (r: RouteType) => { setEditingRoute(r); setRouteModalOpen(true); };

  const handleSaveRoute = async (values: RouteFormValues) => {
    setSavingRoute(true);
    try {
      if (editingRoute) {
        await apiClient.put(`/transport/routes/${editingRoute.id}`, values);
        toast.success('Route updated successfully');
      } else {
        await apiClient.post('/transport/routes', values);
        toast.success('Route added successfully');
      }
      setRouteModalOpen(false);
      setEditingRoute(null);
      fetchRoutes();
      fetchAllRoutes();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to ${editingRoute ? 'update' : 'add'} route`);
    } finally {
      setSavingRoute(false);
    }
  };

  const handleConfirmDeleteRoute = async () => {
    if (!routeToDelete) return;
    setDeletingRoute(true);
    try {
      await apiClient.delete(`/transport/routes/${routeToDelete.id}`);
      toast.success('Route deleted successfully');
      setRouteToDelete(null);
      fetchRoutes();
      fetchAllRoutes();
    } catch (err: any) {
      // 409 Conflict: route referenced by existing assignments.
      toast.error(err.response?.data?.message || 'Failed to delete route');
    } finally {
      setDeletingRoute(false);
    }
  };

  // ---- Assignment create / edit ----
  const handleCreateAssignment = async (values: AssignmentFormValues) => {
    setSavingAssignment(true);
    try {
      if (editingAssignment) {
        await apiClient.put(`/transport/assignments/${editingAssignment.id}`, {
          routeId: values.routeId,
          vehicleId: values.vehicleId,
          pickupPoint: values.pickupPoint || null,
          stopId: values.stopId || null,
        });
        toast.success('Assignment updated successfully');
      } else {
        const { stopId, ...rest } = values;
        await apiClient.post('/transport/assignments', { ...rest, ...(stopId ? { stopId } : {}) });
        toast.success('Assignment created successfully');
      }
      setAssignmentModalOpen(false);
      setEditingAssignment(null);
      fetchAssignments();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to ${editingAssignment ? 'update' : 'create'} assignment`);
    } finally {
      setSavingAssignment(false);
    }
  };

  const openEditAssignment = (a: AssignmentType) => {
    setEditingAssignment({
      id: a.id,
      studentName: `${a.student?.firstName || ''} ${a.student?.lastName || ''}`.trim(),
      routeId: a.routeId,
      vehicleId: a.vehicleId,
      pickupPoint: a.pickupPoint,
      stopId: a.stopId ?? null,
    });
    setAssignmentModalOpen(true);
  };

  const handleConfirmDeleteAssignment = async () => {
    if (!assignmentToDelete) return;
    setDeletingAssignment(true);
    try {
      await apiClient.delete(`/transport/assignments/${assignmentToDelete.id}`);
      toast.success('Assignment removed');
      setAssignmentToDelete(null);
      fetchAssignments();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove assignment');
    } finally {
      setDeletingAssignment(false);
    }
  };

  const vehicleColumns: Column<VehicleType>[] = [
    { key: 'registrationNumber', header: 'Registration', accessor: 'registrationNumber', primary: true },
    { key: 'driverName', header: 'Driver', accessor: 'driverName' },
    { key: 'driverPhone', header: 'Driver Phone', render: (v) => v.driverPhone || '—', hideOnMobile: true },
    { key: 'capacity', header: 'Capacity', align: 'right', render: (v) => `${v.capacity} seats`, exportValue: (v) => v.capacity },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (v) => <StatusBadge status={v.isActive !== false ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'lastLocation',
      header: 'Last Location',
      sortable: false,
      hideOnMobile: true,
      exportValue: (v) => (v.lastLat != null && v.lastLng != null ? `${v.lastLat},${v.lastLng} @ ${v.lastLocationAt ?? ''}` : ''),
      render: (v) =>
        v.lastLat != null && v.lastLng != null ? (
          <a
            href={`https://www.openstreetmap.org/?mlat=${v.lastLat}&mlon=${v.lastLng}#map=16/${v.lastLat}/${v.lastLng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-700 dark:text-blue-300 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {v.lastLat.toFixed(4)}, {v.lastLng.toFixed(4)}
            <span className="block text-xs text-slate-500 dark:text-slate-400">{v.lastLocationAt ? formatDate(v.lastLocationAt, true) : ''}</span>
          </a>
        ) : (
          <span className="text-slate-400 text-sm">Never reported</span>
        ),
    },
  ];

  const routeColumns: Column<RouteType>[] = [
    { key: 'name', header: 'Route Name', accessor: 'name', primary: true },
    {
      key: 'stops',
      header: 'Stops',
      sortable: false,
      exportValue: (r) => r.stops,
      render: (r) =>
        (r._count?.stopPoints ?? 0) > 0 ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); setStopsRoute(r); }} className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline">
            {r._count!.stopPoints} structured stop{r._count!.stopPoints === 1 ? '' : 's'}
          </button>
        ) : (
          <StopsChips stops={r.stops} />
        ),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      hideOnMobile: true,
      render: (r) => allVehicles.find((v) => v.id === r.vehicleId)?.registrationNumber || '—',
    },
    { key: 'distance', header: 'Distance', render: (r) => r.distance || '—', hideOnMobile: true },
    {
      key: 'routeFare',
      header: 'Monthly Fare',
      align: 'right',
      exportValue: (r) => Number(r.routeFare) || 0,
      render: (r) => <span className="tabular-nums">{formatCurrency(r.routeFare)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (r) => <StatusBadge status={r.isActive !== false ? 'ACTIVE' : 'INACTIVE'} />,
    },
  ];

  const assignmentColumns: Column<AssignmentType>[] = [
    {
      key: 'studentName',
      header: 'Student',
      primary: true,
      render: (a) => `${a.student?.firstName || ''} ${a.student?.lastName || ''}`.trim() || '—',
      exportValue: (a) => `${a.student?.firstName || ''} ${a.student?.lastName || ''}`.trim(),
    },
    { key: 'studentId', header: 'Student ID', render: (a) => a.student?.studentId || '—', hideOnMobile: true },
    { key: 'routeName', header: 'Route', render: (a) => a.route?.name || '—', exportValue: (a) => a.route?.name || '' },
    { key: 'vehicle', header: 'Vehicle', render: (a) => a.vehicle?.registrationNumber || '—' },
    { key: 'stop', header: 'Stop', render: (a) => (a.stop ? `${a.stop.sequence}. ${a.stop.name}` : '—'), exportValue: (a) => a.stop?.name || '' },
    { key: 'pickupPoint', header: 'Pickup Point', render: (a) => a.pickupPoint || '—', hideOnMobile: true },
    {
      key: 'fee',
      header: 'Monthly Fee',
      align: 'right',
      exportValue: (a) => Number(a.route?.routeFare) || 0,
      render: (a) => <span className="tabular-nums">{formatCurrency(a.route?.routeFare)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transport Management"
        description="Manage vehicles, routes, and student transport assignments."
        actions={
          activeTab === 'vehicles' ? (
            <Button variant="gradient" onClick={openAddVehicle}><Plus className="w-4 h-4" /> Add Vehicle</Button>
          ) : activeTab === 'routes' ? (
            <Button variant="gradient" onClick={openAddRoute}><Plus className="w-4 h-4" /> Add Route</Button>
          ) : activeTab === 'assignments' ? (
            <Button variant="gradient" onClick={() => { setEditingAssignment(null); setAssignmentModalOpen(true); }}><Plus className="w-4 h-4" /> Assign Student</Button>
          ) : null
        }
      />

      <Tabs
        variant="pills"
        label="Transport sections"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        tabs={[
          { id: 'vehicles', label: 'Vehicles', icon: <Bus className="w-4 h-4" /> },
          { id: 'routes', label: 'Routes', icon: <Map className="w-4 h-4" /> },
          { id: 'assignments', label: 'Assignments', icon: <Users className="w-4 h-4" /> },
          { id: 'reports', label: 'Route Report', icon: <BarChart3 className="w-4 h-4" /> },
          ...(canBill ? [{ id: 'fees', label: 'Transport Fees', icon: <Receipt className="w-4 h-4" /> }] : []),
        ]}
      />

      {activeTab === 'reports' ? (
        <RouteReport />
      ) : activeTab === 'fees' && canBill ? (
        <TransportFees routes={allRoutes} />
      ) : activeTab === 'vehicles' ? (
        vehiclesError && vehicles.length === 0 ? (
          <ErrorState onRetry={fetchVehicles} message="Could not load vehicles." />
        ) : (
          <div className="space-y-3">
          <IncompleteNotice
            title="Live GPS tracking"
            reason="Live GPS tracking needs a GPS device integration (planned). Until then, each vehicle shows its last-known location, updated manually with “Update location”."
          />
          <DataTable
            data={vehicles}
            columns={vehicleColumns}
            isLoading={vehiclesLoading}
            serverSearch
            onSearch={vehiclesParams.setSearch}
            searchPlaceholder="Search vehicles by registration or driver..."
            serverPagination
            totalCount={vehiclesTotal}
            page={vehiclesParams.params.page}
            pageSize={vehiclesParams.params.pageSize}
            onPageChange={vehiclesParams.setPage}
            onPageSizeChange={vehiclesParams.setPageSize}
            exportFileName="transport-vehicles"
            emptyTitle="No vehicles yet"
            emptyDescription="Add a vehicle to assign it to a route."
            emptyAction={<Button variant="gradient" size="sm" onClick={openAddVehicle}><Plus className="w-4 h-4" /> Add Vehicle</Button>}
            actions={[
              { label: 'Edit', icon: 'edit', onClick: openEditVehicle },
              { label: 'Update location', onClick: (v) => setLocationVehicle(v) },
              { label: 'Delete', icon: 'delete', variant: 'danger', onClick: (v) => setVehicleToDelete(v) },
            ]}
          />
          </div>
        )
      ) : activeTab === 'routes' ? (
        routesError && routes.length === 0 ? (
          <ErrorState onRetry={fetchRoutes} message="Could not load routes." />
        ) : (
          <DataTable
            data={routes}
            columns={routeColumns}
            isLoading={routesLoading}
            serverSearch
            onSearch={routesParams.setSearch}
            searchPlaceholder="Search routes by name..."
            serverPagination
            totalCount={routesTotal}
            page={routesParams.params.page}
            pageSize={routesParams.params.pageSize}
            onPageChange={routesParams.setPage}
            onPageSizeChange={routesParams.setPageSize}
            exportFileName="transport-routes"
            emptyTitle="No routes yet"
            emptyDescription="Add a route to start assigning vehicles and students."
            emptyAction={<Button variant="gradient" size="sm" onClick={openAddRoute}><Plus className="w-4 h-4" /> Add Route</Button>}
            actions={[
              { label: 'Stops', icon: 'view', onClick: (r) => setStopsRoute(r) },
              { label: 'Edit', icon: 'edit', onClick: openEditRoute },
              { label: 'Delete', icon: 'delete', variant: 'danger', onClick: (r) => setRouteToDelete(r) },
            ]}
          />
        )
      ) : assignmentsError && assignments.length === 0 ? (
        <ErrorState onRetry={fetchAssignments} message="Could not load assignments." />
      ) : (
        <DataTable
          data={assignments}
          columns={assignmentColumns}
          isLoading={assignmentsLoading}
          serverSearch
          onSearch={assignmentsParams.setSearch}
          searchPlaceholder="Search assignments by student or route..."
          serverPagination
          totalCount={assignmentsTotal}
          page={assignmentsParams.params.page}
          pageSize={assignmentsParams.params.pageSize}
          onPageChange={assignmentsParams.setPage}
          onPageSizeChange={assignmentsParams.setPageSize}
          exportFileName="transport-assignments"
          emptyTitle="No student assignments yet"
          emptyDescription="Assign students to a transport route to see them listed here."
          emptyAction={<Button variant="gradient" size="sm" onClick={() => { setEditingAssignment(null); setAssignmentModalOpen(true); }}><Plus className="w-4 h-4" /> Assign Student</Button>}
          actions={[
            { label: 'Edit', icon: 'edit', onClick: openEditAssignment },
            { label: 'Remove', icon: 'delete', variant: 'danger', onClick: (a) => setAssignmentToDelete(a) },
          ]}
        />
      )}

      <VehicleModal
        isOpen={vehicleModalOpen}
        isEditing={!!editingVehicle}
        isSaving={savingVehicle}
        initialValues={editingVehicle ? { registrationNumber: editingVehicle.registrationNumber, capacity: editingVehicle.capacity, driverName: editingVehicle.driverName, driverPhone: editingVehicle.driverPhone || '', isActive: editingVehicle.isActive } : null}
        onClose={() => { setVehicleModalOpen(false); setEditingVehicle(null); }}
        onSubmit={handleSaveVehicle}
      />

      <RouteModal
        isOpen={routeModalOpen}
        vehicles={allVehicles}
        isEditing={!!editingRoute}
        isSaving={savingRoute}
        initialValues={
          editingRoute
            ? {
                name: editingRoute.name,
                stops: editingRoute.stops || '',
                startPoint: editingRoute.startPoint || '',
                endPoint: editingRoute.endPoint || '',
                distance: editingRoute.distance || '',
                vehicleId: editingRoute.vehicleId || '',
                routeFare: Number(editingRoute.routeFare) || 0,
                isActive: editingRoute.isActive,
              }
            : null
        }
        onClose={() => { setRouteModalOpen(false); setEditingRoute(null); }}
        onSubmit={handleSaveRoute}
      />

      <AssignmentModal
        isOpen={assignmentModalOpen}
        routes={allRoutes}
        vehicles={allVehicles}
        isSaving={savingAssignment}
        editing={editingAssignment}
        onClose={() => { setAssignmentModalOpen(false); setEditingAssignment(null); }}
        onSubmit={handleCreateAssignment}
      />

      <RouteStopsDrawer route={stopsRoute} onClose={() => setStopsRoute(null)} onChanged={fetchRoutes} />

      <VehicleLocationModal vehicle={locationVehicle} onClose={() => setLocationVehicle(null)} onSaved={fetchVehicles} />

      <ConfirmModal
        isOpen={!!assignmentToDelete}
        title="Remove assignment"
        message={`Remove ${`${assignmentToDelete?.student?.firstName || ''} ${assignmentToDelete?.student?.lastName || ''}`.trim() || 'this student'} from transport? Existing invoices are not affected.`}
        confirmLabel="Remove"
        variant="danger"
        isLoading={deletingAssignment}
        onConfirm={handleConfirmDeleteAssignment}
        onCancel={() => setAssignmentToDelete(null)}
      />

      <ConfirmModal
        isOpen={!!vehicleToDelete}
        title="Delete vehicle"
        message={`Are you sure you want to delete "${vehicleToDelete?.registrationNumber}"? This cannot be undone. Vehicles with active assignments cannot be deleted.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletingVehicle}
        onConfirm={handleConfirmDeleteVehicle}
        onCancel={() => setVehicleToDelete(null)}
      />

      <ConfirmModal
        isOpen={!!routeToDelete}
        title="Delete route"
        message={`Are you sure you want to delete "${routeToDelete?.name}"? This cannot be undone. Routes with active assignments cannot be deleted.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletingRoute}
        onConfirm={handleConfirmDeleteRoute}
        onCancel={() => setRouteToDelete(null)}
      />
    </div>
  );
}
