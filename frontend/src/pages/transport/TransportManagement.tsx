import React, { useState, useEffect } from 'react';
import { Bus, Search, Plus, Filter, Map, Users, Settings, X } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useTableParams } from '../../hooks/useTableParams';
import { Pagination } from '../../components/Pagination';

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
    } catch (error) {
      console.error('Failed to fetch transport data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/transport/routes', newRoute);
      toast.success('Route added successfully');
      setIsAddRouteModalOpen(false);
      setNewRoute({ name: '', startPoint: '', endPoint: '', distance: '', vehicleId: '', stops: 1 });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to add route');
    }
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Transport Management</h2>
          <p className="text-slate-400 text-sm">Manage routes, vehicles, and student assignments.</p>
        </div>
        <button onClick={() => activeTab === 'routes' ? setIsAddRouteModalOpen(true) : activeTab === 'vehicles' ? setIsAddVehicleModalOpen(true) : null} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" />
          {activeTab === 'routes' ? 'Add Route' : activeTab === 'vehicles' ? 'Add Vehicle' : 'Assign Student'}
        </button>
      </div>

      <div className="glass rounded-2xl border border-white/10 flex overflow-hidden">
        <button
          onClick={() => { setActiveTab('routes'); setSearch(''); }}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'routes' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          <div className="flex items-center justify-center gap-2"><Map className="w-4 h-4" /> Routes</div>
        </button>
        <button
          onClick={() => { setActiveTab('vehicles'); setSearch(''); }}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'vehicles' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          <div className="flex items-center justify-center gap-2"><Bus className="w-4 h-4" /> Vehicles</div>
        </button>
        <button
          onClick={() => { setActiveTab('assignments'); setSearch(''); }}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'assignments' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          <div className="flex items-center justify-center gap-2"><Users className="w-4 h-4" /> Assignments</div>
        </button>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            value={params.search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="px-4 py-2 bg-slate-800 border border-white/10 hover:bg-slate-700 text-white rounded-xl flex items-center gap-2 transition-colors">
          <Filter className="w-4 h-4" />
          Filter
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-10">Loading...</div>
      ) : activeTab === 'routes' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {routes.map((route) => (
            <div key={route.id} className="glass p-5 rounded-2xl border border-white/10 hover:border-blue-500/50 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
                    <Map className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{route.name}</h3>
                    <p className="text-slate-400 text-sm">Vehicle: {route.vehicleId}</p>
                  </div>
                </div>
                <button className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
              <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">From</span>
                  <span className="text-slate-300 font-medium">{route.startPoint}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">To</span>
                  <span className="text-slate-300 font-medium">{route.endPoint}</span>
                </div>
                <div className="flex justify-between text-sm pt-3 border-t border-white/10">
                  <span className="text-slate-500">Distance</span>
                  <span className="text-slate-300">{route.distance}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Stops</span>
                  <span className="text-slate-300">{route.stops}</span>
                </div>
              </div>
            </div>
            ))}
          </div>
          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={totalRoutes}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      ) : activeTab === 'vehicles' ? (
        <div className="space-y-4">
          <div className="glass rounded-2xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="p-4 text-sm font-semibold text-slate-300">Vehicle ID</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Registration</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Capacity</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Driver</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Status</th>
                </tr>
              </thead>
                <tbody className="divide-y divide-white/10">
                  {vehicles.map((vehicle) => (
                    <tr key={vehicle.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                          <Bus className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium text-white">{vehicle.id}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-300">{vehicle.registrationNumber}</td>
                    <td className="p-4 text-sm text-slate-400">{vehicle.capacity} seats</td>
                    <td className="p-4 text-sm text-slate-300">{vehicle.driverName}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${vehicle.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/20 text-amber-400 border border-amber-500/20'}`}>
                        {vehicle.status}
                      </span>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={totalVehicles}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="glass rounded-2xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="p-4 text-sm font-semibold text-slate-300">Student Name</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Route</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Stop</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Monthly Fee</th>
                </tr>
              </thead>
                <tbody className="divide-y divide-white/10">
                  {assignments.map((assignment) => (
                    <tr key={assignment.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 text-sm font-medium text-white">{assignment.studentName || `${assignment.student?.firstName || ''} ${assignment.student?.lastName || ''}`.trim()}</td>
                      <td className="p-4 text-sm text-slate-300">{assignment.routeName || assignment.route?.routeName}</td>
                    <td className="p-4 text-sm text-slate-400">{assignment.stopName}</td>
                    <td className="p-4 text-sm text-slate-300">{assignment.fee}</td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={totalAssignments}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
      {/* Add Route Modal */}
      {isAddRouteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Add New Route</h3>
              <button onClick={() => setIsAddRouteModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddRoute} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Route Name</label>
                <input required type="text" value={newRoute.name} onChange={e => setNewRoute({...newRoute, name: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Start Point</label>
                  <input required type="text" value={newRoute.startPoint} onChange={e => setNewRoute({...newRoute, startPoint: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">End Point</label>
                  <input required type="text" value={newRoute.endPoint} onChange={e => setNewRoute({...newRoute, endPoint: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Distance (e.g. 15 km)</label>
                  <input required type="text" value={newRoute.distance} onChange={e => setNewRoute({...newRoute, distance: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Stops</label>
                  <input required type="number" min="1" value={newRoute.stops} onChange={e => setNewRoute({...newRoute, stops: parseInt(e.target.value)})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Vehicle ID</label>
                <input required type="text" value={newRoute.vehicleId} onChange={e => setNewRoute({...newRoute, vehicleId: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsAddRouteModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors">Add Route</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {isAddVehicleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Add New Vehicle</h3>
              <button onClick={() => setIsAddVehicleModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddVehicle} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Registration Number</label>
                <input required type="text" value={newVehicle.registrationNumber} onChange={e => setNewVehicle({...newVehicle, registrationNumber: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Driver Name</label>
                <input required type="text" value={newVehicle.driverName} onChange={e => setNewVehicle({...newVehicle, driverName: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Capacity</label>
                <input required type="number" min="1" value={newVehicle.capacity} onChange={e => setNewVehicle({...newVehicle, capacity: parseInt(e.target.value)})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsAddVehicleModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors">Add Vehicle</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
