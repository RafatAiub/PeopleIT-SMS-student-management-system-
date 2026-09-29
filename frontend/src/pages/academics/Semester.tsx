import React from 'react';
import { SimpleLookupManager } from '../../components/academics/SimpleLookupManager';

const Semester = () => (
  <SimpleLookupManager
    title="Semester"
    apiBasePath="/academics/semesters"
    description="Create and manage academic semesters."
  />
);

export default Semester;
