import React from 'react';
import { SimpleLookupManager } from '../../components/academics/SimpleLookupManager';

const Medium = () => (
  <SimpleLookupManager
    title="Medium"
    apiBasePath="/academics/mediums"
    description="Create and manage the mediums of instruction offered by the institution."
  />
);

export default Medium;
