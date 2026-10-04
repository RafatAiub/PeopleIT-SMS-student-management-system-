import React from 'react';
import { UploadButtonField } from './UploadButtonField';
import type { AdmissionFormApi } from './useAdmissionForm';

// Step 4: student's own photo + the two documents (birth certificate, last
// passing result) — same upload helper, same 4MB limit, same accepted types.
export const Step4PhotoDocuments: React.FC<{ form: AdmissionFormApi }> = ({ form }) => {
  const {
    photoFileName,
    handlePhotoSelected,
    birthCertificate,
    lastPassingResult,
    handleDocumentSelected,
    setBirthCertificate,
    setLastPassingResult,
  } = form;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UploadButtonField
          label="Image"
          required
          fileName={photoFileName}
          accept="image/*"
          onFileSelected={handlePhotoSelected}
          helperText="Recommended image size: 120x120px (square)"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UploadButtonField
          label="Birth Certificate"
          required
          fileName={birthCertificate?.name || ''}
          accept="image/*,application/pdf"
          onFileSelected={(file) => handleDocumentSelected(file, setBirthCertificate)}
        />
        <UploadButtonField
          label="Last Passing Result"
          required
          fileName={lastPassingResult?.name || ''}
          accept="image/*,application/pdf"
          onFileSelected={(file) => handleDocumentSelected(file, setLastPassingResult)}
        />
      </div>
    </div>
  );
};
