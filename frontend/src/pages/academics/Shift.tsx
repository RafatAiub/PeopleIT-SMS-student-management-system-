import React from 'react';
import { SimpleLookupManager } from '../../components/academics/SimpleLookupManager';

const Shift = () => (
  <SimpleLookupManager
    title="Shift"
    apiBasePath="/academics/shifts"
    description="Create and manage the school shifts (e.g. Morning, Day)."
  />
);

export default Shift;
