import React, { useState, useEffect } from 'react';
import { Bus, Search, Plus, Filter, Map, Users, Settings, X } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useTableParams } from '../../hooks/useTableParams';
import { Pagination } from '../../components/Pagination';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { EmptyState } from '../../components/common/EmptyState';

interface RouteType {
  id: string;
  name: string;
  startPoint: string;
  endPoint: string;
  distance: string;
  vehicleId: string;
  stops: number;
}

interface VehicleType {
  id: string;
  registrationNumber: string;
  capacity: number;
  driverName: string;
  status: string;
}

interface AssignmentType {
  id: string;
  studentName: string;
  routeName: string;
  stopName: string;
  fee: string;
  student?: { firstName: string; lastName: string };
  route?: { routeName: string };
}

export default function TransportManagement() {
  const [activeTab, setActiveTab] = useState<'routes' | 'vehicles' | 'assignments'>('routes');
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [totalRoutes, setTotalRoutes] = useState(0);
  const [vehicles, setVehicles] = useState<VehicleType[]>([]);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [assignments, setAssignments] = useState<AssignmentType[]>([]);
  const [totalAssignments, setTotalAssignments] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();
  const [isAddRouteModalOpen, setIsAddRouteModalOpen] = useState(false);
  const [isAddVehicleModalOpen, setIsAddVehicleModalOpen] = useState(false);
  const [newRoute, setNewRoute] = useState({ name: '', startPoint: '', endPoint: '', distance: '', vehicleId: '', stops: 1 });
  const [newVehicle, setNewVehicle] = useState({ registrationNumber: '', capacity: 40, driverName: '' });
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [savingRoute, setSavingRoute] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab, params.page, params.pageSize, debouncedSearch]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        pageSize: params.pageSize.toString(),
      });
      if (debouncedSearch) {
        queryParams.append('search', debouncedSearch);
      }

      if (activeTab === 'routes') {
        const routesRes = await apiClient.get(`/transport/routes?${queryParams.toString()}`);
        setRoutes(routesRes.data.data?.routes || routesRes.data.data || []);
        setTotalRoutes(routesRes.data.data?.total || routesRes.data.meta?.total || 0);
      } else if (activeTab === 'vehicles') {
        const vehiclesRes = await apiClient.get(`/transport/vehicles?${queryParams.toString()}`);
        setVehicles(vehiclesRes.data.data?.vehicles || vehiclesRes.data.data || []);
        setTotalVehicles(vehiclesRes.data.data?.total || vehiclesRes.data.meta?.total || 0);
      } else if (activeTab === 'assignments') {
        const assignmentsRes = await apiClient.get(`/transport/assignments?${queryParams.toString()}`);
        setAssignments(assignmentsRes.data.data?.assignments || assignmentsRes.data.data || []);
        setTotalAssignments(assignmentsRes.data.data?.total || assignmentsRes.data.meta?.total || 0);
      }
    } catch (error: any) {
      console.error('Failed to fetch transport data:', error);
      toast.error(error.response?.data?.message || 'Failed to load transport data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRoute(true);
    try {
      if (editingRouteId) {
        await apiClient.put(`/transport/routes/${editingRouteId}`, newRoute);
        toast.success('Route updated successfully');
      } else {
        await apiClient.post('/transport/routes', newRoute);
        toast.success('Route added successfully');
      }
      setIsAddRouteModalOpen(false);
      setEditingRouteId(null);
      setNewRoute({ name: '', startPoint: '', endPoint: '', distance: '', vehicleId: '', stops: 1 });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || `Failed to ${editingRouteId ? 'update' : 'add'} route`);
    } finally {
      setSavingRoute(false);
    }
  };

  const openAddRoute = () => {
    setEditingRouteId(null);
    setNewRoute({ name: '', startPoint: '', endPoint: '', distance: '', vehicleId: '', stops: 1 });
    setIsAddRouteModalOpen(true);
  };

  const openEditRoute = (route: RouteType) => {
    setEditingRouteId(route.id);
    setNewRoute({ name: route.name, startPoint: route.startPoint, endPoint: route.endPoint, distance: route.distance, vehicleId: route.vehicleId, stops: route.stops });
    setIsAddRouteModalOpen(true);
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/transport/vehicles', newVehicle);
      toast.success('Vehicle added successfully');
      setIsAddVehicleModalOpen(false);
      setNewVehicle({ registrationNumber: '', capacity: 40, driverName: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to add vehicle');
    }
  };

  const vehicleColumns: Column<VehicleType>[] = [
    {
      key: 'id',
      header: 'Vehicle ID',
      accessor: 'id',
      render: (vehicle) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-transparent">
            <Bus className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{vehicle.id}</span>
        </div>
      ),
    },
    { key: 'registrationNumber', header: 'Registration', accessor: 'registrationNumber' },
    {
      key: 'capacity',
      header: 'Capacity',
      accessor: 'capacity',
      render: (vehicle) => `${vehicle.capacity} seats`,
    },
    { key: 'driverName', header: 'Driver', accessor: 'driverName' },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (vehicle) => (
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
          vehicle.status === 'Active'
            ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
            : 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
        }`}>
          {vehicle.status}
        </span>
      ),
    },
  ];

  const assignmentColumns: Column<AssignmentType>[] = [
    {
      key: 'studentName',
      header: 'Student Name',
      accessor: 'studentName',
      render: (assignment) => assignment.studentName || `${assignment.student?.firstName || ''} ${assignment.student?.lastName || ''}`.trim(),
    },
    {
      key: 'routeName',
      header: 'Route',
      accessor: 'routeName',
      render: (assignment) => assignment.routeName || assignment.route?.routeName,
    },
    { key: 'stopName', header: 'Stop', accessor: 'stopName' },
    {
      key: 'fee',
      header: 'Monthly Fee',
      accessor: 'fee',
      render: (assignment) => <span className="tabular-nums">{assignment.fee}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Transport Management</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">Manage routes, vehicles, and student assignments.</p>
        </div>
        {activeTab !== 'assignments' && (
          <button
            onClick={() => activeTab === 'routes' ? openAddRoute() : setIsAddVehicleModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'routes' ? 'Add Route' : 'Add Vehicle'}
          </button>
        )}
      </div>

      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/10 flex overflow-hidden bg-slate-50 dark:bg-slate-900/30 p-1 gap-1 shadow-sm">
        <button
          onClick={() => { setActiveTab('routes'); setSearch(''); }}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'routes'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-white/5'
              : 'text-slate-400 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="flex items-center justify-center gap-2"><Map className="w-4 h-4" /> Routes</div>
        </button>
        <button
          onClick={() => { setActiveTab('vehicles'); setSearch(''); }}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'vehicles'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-white/5'
              : 'text-slate-400 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="flex items-center justify-center gap-2"><Bus className="w-4 h-4" /> Vehicles</div>
        </button>
        <button
          onClick={() => { setActiveTab('assignments'); setSearch(''); }}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'assignments'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-white/5'
              : 'text-slate-400 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="flex items-center justify-center gap-2"><Users className="w-4 h-4" /> Assignments</div>
        </button>
      </div>

      {activeTab === 'routes' && (
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search routes..."
              className="input-field pl-10"
              value={params.search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white rounded-xl flex items-center gap-2 transition-colors font-medium text-sm">
            <Filter className="w-4 h-4 text-slate-500" />
            Filter
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 py-10">Loading...</div>
      ) : activeTab === 'routes' ? (
        <div className="space-y-4">
          {routes.length === 0 ? (
            <div className="glass-card p-8">
              <EmptyState
                title="No routes yet"
                description="Add a route to start assigning vehicles and students."
                icon={<Map className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
                action={
                  <button
                    onClick={openAddRoute}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl transition-all text-sm font-semibold"
                  >
                    <Plus className="w-4 h-4" /> Add Route
                  </button>
                }
              />
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {routes.map((route) => (
            <div key={route.id} className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white dark:bg-transparent shadow-sm hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-transparent">
                    <Map className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{route.name}</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">Vehicle: {route.vehicleId}</p>
                  </div>
                </div>
                <button onClick={() => openEditRoute(route)} aria-label={`Edit ${route.name}`} title="Edit route" className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200/50 dark:border-white/5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">From</span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">{route.startPoint}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">To</span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">{route.endPoint}</span>
                </div>
                <div className="flex justify-between text-sm pt-3 border-t border-slate-200 dark:border-white/10">
                  <span className="text-slate-500">Distance</span>
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{route.distance}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Stops</span>
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{route.stops}</span>
                </div>
              </div>
            </div>
            ))}
          </div>
          )}
          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={totalRoutes}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      ) : activeTab === 'vehicles' ? (
        <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 bg-white dark:bg-transparent shadow-sm p-4">
          <DataTable
            data={vehicles}
            columns={vehicleColumns}
            isLoading={loading}
            searchPlaceholder="Search vehicles..."
            serverSearch
            onSearch={setSearch}
            serverPagination
            totalCount={totalVehicles}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            emptyTitle="No vehicles yet"
            emptyDescription="Add a vehicle to assign it to a route."
          />
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 bg-white dark:bg-transparent shadow-sm p-4">
          <DataTable
            data={assignments}
            columns={assignmentColumns}
            isLoading={loading}
            searchPlaceholder="Search assignments..."
            serverSearch
            onSearch={setSearch}
            serverPagination
            totalCount={totalAssignments}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            emptyTitle="No student assignments yet"
            emptyDescription="Assign students to a transport route to see them listed here."
          />
        </div>
      )}

      {/* Add Route Modal */}
      {isAddRouteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{editingRouteId ? 'Edit Route' : 'Add New Route'}</h3>
              <button
                onClick={() => { setIsAddRouteModalOpen(false); setEditingRouteId(null); }}
                aria-label="Close"
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddRoute} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Route Name</label>
                <input required type="text" value={newRoute.name} onChange={e => setNewRoute({...newRoute, name: e.target.value})} className="input-field" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Point</label>
                  <input required type="text" value={newRoute.startPoint} onChange={e => setNewRoute({...newRoute, startPoint: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Point</label>
                  <input required type="text" value={newRoute.endPoint} onChange={e => setNewRoute({...newRoute, endPoint: e.target.value})} className="input-field" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Distance (e.g. 15 km)</label>
                  <input required type="text" value={newRoute.distance} onChange={e => setNewRoute({...newRoute, distance: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Stops</label>
                  <input required type="number" min="1" value={newRoute.stops} onChange={e => setNewRoute({...newRoute, stops: parseInt(e.target.value)})} className="input-field" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Vehicle ID</label>
                <input required type="text" value={newRoute.vehicleId} onChange={e => setNewRoute({...newRoute, vehicleId: e.target.value})} className="input-field" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => { setIsAddRouteModalOpen(false); setEditingRouteId(null); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button type="submit" disabled={savingRoute} className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all text-sm active:scale-[0.98] disabled:opacity-50">
                  {savingRoute ? 'Saving...' : editingRouteId ? 'Save Changes' : 'Add Route'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {isAddVehicleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Add New Vehicle</h3>
              <button
                onClick={() => setIsAddVehicleModalOpen(false)}
                aria-label="Close"
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddVehicle} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Registration Number</label>
                <input required type="text" value={newVehicle.registrationNumber} onChange={e => setNewVehicle({...newVehicle, registrationNumber: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Driver Name</label>
                <input required type="text" value={newVehicle.driverName} onChange={e => setNewVehicle({...newVehicle, driverName: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Capacity</label>
                <input required type="number" min="1" value={newVehicle.capacity} onChange={e => setNewVehicle({...newVehicle, capacity: parseInt(e.target.value)})} className="input-field" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsAddVehicleModalOpen(false)} 
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all text-sm active:scale-[0.98]">Add Vehicle</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
