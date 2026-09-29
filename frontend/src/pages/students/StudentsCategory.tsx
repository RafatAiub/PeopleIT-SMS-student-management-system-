import React from 'react';
import { SimpleLookupManager } from '../../components/academics/SimpleLookupManager';

const StudentsCategory = () => (
  <SimpleLookupManager
    title="Category"
    apiBasePath="/academics/student-categories"
    description="Create and manage the student categories offered by the institution."
  />
);

export default StudentsCategory;
