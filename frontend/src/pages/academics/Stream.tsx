import React from 'react';
import { SimpleLookupManager } from '../../components/academics/SimpleLookupManager';

const Stream = () => (
  <SimpleLookupManager
    title="Stream"
    apiBasePath="/academics/streams"
    description="Create and manage academic streams (e.g. Science, Commerce, Arts)."
  />
);

export default Stream;
