import React, { useRef, useEffect, useMemo, useState } from "react";
import {
  PdfViewerComponent,
  Toolbar,
  Magnification,
  Navigation,
  LinkAnnotation,
  BookmarkView,
  ThumbnailView,
  Print,
  TextSelection,
  TextSearch,
  Annotation,
  FormFields,
  FormDesigner,
  PageOrganizer,
  Inject
} from "@syncfusion/ej2-react-pdfviewer";

export default function Pdfviewerpage({ user, patient, onBack, pdfFileName }) {
  const viewerRef = useRef(null);
  const [modalFileName, setModalFileName] = useState("");
  /* ==============================
     ✅ Attachment / Stamp State
  ============================== */
  const [doctorSigned, setDoctorSigned] = useState(false);
  const stampFileInputRef = useRef(null);
  const healthcareFileStoreRef = useRef(new Map()); // fieldName → { file, url }
  const pendingAttachmentsRef = useRef(new Map()); // fieldName → File
  const [showBill, setShowBill] = useState(false);
  const [billPdfName, setBillPdfName] = useState(null);
  const [adminSigned, setAdminSigned] = useState(false);
  const originalPdfRef = useRef(null);
  const isViewingAttachmentRef = useRef(false);
  const basePdfRef = useRef(null);       // Patient Information PDF
  const viewingAttachmentRef = useRef(false);
  const [isViewingBill, setIsViewingBill] = useState(false);
  const getFileNameFromUrl = (url) => {
    if (!url) return "";
    try {
      return decodeURIComponent(url.split("/").pop());
    } catch {
      return "Document";
    }
  };
  const HEALTHCARE_STAMP_NAME = "Add Attachment";
  const HEALTHCARE_ATTACH_FIELDS = [
    "bloodattach",
    "urineattach",
    "ecgattach",
    "ctattach",
    "mriattach",
    "xrayattach",
    "ultrasoundattach",
    "endoscopyattach",
    "biopsyattach",
    "bronchoscopyattach"
  ];

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalSrc, setModalSrc] = useState(null);
  const closeModal = () => {
    setModalSrc(null);
    setModalFileName("");
  };
  const API_BASE = useMemo(
    () => process.env.REACT_APP_API_URL || "http://localhost:5063",
    []
  );
  /* ==============================
     ✅ Load Admin‑Filled PDF
  ============================== */
  const [adminFilledPdfName, setAdminFilledPdfName] = useState(null);
useEffect(() => {
  const loadCorrectPdf = async () => {
    try {
      const pid = String(patient?.patientId || patient?.id || "").trim();
      if (!pid) return;

      // ✅ CRITICAL FIX: If pdfFileName is passed (from patient.formPdf), use it directly!
      if (pdfFileName && typeof pdfFileName === "string" && pdfFileName.trim()) {
        setAdminFilledPdfName(pdfFileName.trim());
        return;
      }

      const res = await fetch(
        `${API_BASE}/api/Authentication/GetUserFiles?username=ALL`,
        { cache: "no-cache" }
      );

      const files = await res.json();

      // ✅ Only PDFs for this patient
      const patientFiles = files.filter(
        (f) =>
          typeof f.fileName === "string" &&
          f.fileName.includes(`_${pid}`)
      );

      if (patientFiles.length === 0) {
        console.warn("No PDF found for patient", pid, "Available files:", files.map(f => f.fileName));
        return;
      }

      const sortNewest = (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt);

      // ✅ Priority order
      const finalLab = patientFiles.filter(f =>
        f.fileName.includes("_FINAL_LAB")
      );
      if (finalLab.length) {
        setAdminFilledPdfName(finalLab.sort(sortNewest)[0].fileName);
        return;
      }

      const finalDoctor = patientFiles.filter(f =>
        f.fileName.includes("_FINAL_DOCTOR")
      );
      if (finalDoctor.length) {
        setAdminFilledPdfName(finalDoctor.sort(sortNewest)[0].fileName);
        return;
      }

      const labAttach = patientFiles.filter(f =>
        f.fileName.includes("_LAB_ATTACH")
      );
      if (labAttach.length) {
        setAdminFilledPdfName(labAttach.sort(sortNewest)[0].fileName);
        return;
      }

      // ✅ FIXED: Handle both _LAB_ and _LAB patterns
      const lab = patientFiles.filter(f => {
        const fname = f.fileName.toLowerCase();
        return fname.includes("_lab_") || 
               (fname.includes("_lab.pdf") && !fname.includes("_lab_attach"));
      });
      if (lab.length) {
        setAdminFilledPdfName(lab.sort(sortNewest)[0].fileName);
        return;
      }

      // ✅ ✅ CRITICAL FIX: fallback to BASE ADMIN PDF
      const adminBase = patientFiles.filter(
        f =>
          !f.fileName.includes("_LAB") &&
          !f.fileName.includes("_FINAL")
      );

      if (adminBase.length) {
        setAdminFilledPdfName(adminBase.sort(sortNewest)[0].fileName);
        return;
      }
    } catch (err) {
      console.error("PDF resolution failed", err);
    }
  };

  loadCorrectPdf();
}, [patient, API_BASE]);
const applyDoctorReadOnlyRules = () => {
  if (user?.role !== "Doctor") return;

  const viewer =
    viewerRef.current?.ej2Instances || viewerRef.current;
  if (!viewer) return;

  const DOCTOR_EDITABLE_FIELDS = [
    "symptoms",
    "diagnosis",
    "nextvisit",
    "doctorsignature",
    "me1",
    "me2",
    "me3",
    "me4",
    "me5",
    "m1",
    "a1",
    "n1",
    "m2",
    "a2",
    "n2",
    "m3",
    "a3",
    "n3",
    "m4",
    "a4",
    "n4",
    "m5",
    "a5",
    "n5"
  ];

  const fields =
    viewer.formFieldCollections ||
    viewer.retrieveFormFields?.() ||
    [];

  const normalized = Array.isArray(fields)
    ? fields
    : Object.values(fields);

  normalized.forEach((field) => {
    const name = (field.name || "").toLowerCase();

    // ✅ EXACT MATCH ONLY
    const shouldBeEditable = DOCTOR_EDITABLE_FIELDS.includes(name);

    viewer.formDesignerModule?.updateFormField(field.id, {
      isReadOnly: !shouldBeEditable,
      isEnabled: shouldBeEditable
    });
  });
};
const TEST_TO_ATTACHMENT_MAP = {
  bloodtest: "bloodattach",
  urinetest: "urineattach",
  ecg: "ecgattach",
  ctscan: "ctattach",
  mri: "mriattach",
  xray: "xrayattach",
  ultrasound: "ultrasoundattach",
  endoscopy: "endoscopyattach",
  biopsy: "biopsyattach",
  bronchoscopy: "bronchoscopyattach"
};
const syncTestFieldsToAttachments = () => {
  const viewer =
    viewerRef.current?.ej2Instances || viewerRef.current;
  if (!viewer) return;

  const fields =
    viewer.formFieldCollections ||
    viewer.retrieveFormFields?.() ||
    [];

  const normalized = Array.isArray(fields)
    ? fields
    : Object.values(fields);

  const fieldMap = {};
  normalized.forEach((f) => {
    fieldMap[(f.name || "").toLowerCase()] = f;
  });

  Object.entries(TEST_TO_ATTACHMENT_MAP).forEach(
    ([testName, attachName]) => {
      const testField = fieldMap[testName];
      const attachField = fieldMap[attachName];

      // ✅ CORRECT: use isSelected for checkbox fields
      const isSelected =
        testField?.isSelected === true;

      if (isSelected && attachField) {
        // ✅ Auto-fill only if empty
        if (!attachField.value) {
          viewer.formDesignerModule.updateFormField(
            attachField.id,
            {
              value: "Requested"
            }
          );
        }

        // ✅ Ensure attachment field is editable
        viewer.formDesignerModule.updateFormField(
          attachField.id,
          {
            isReadOnly: false,
            isEnabled: true
          }
        );
      }
    }
  );
};

const applyLabReadOnlyRules = () => {
  if (user?.role !== "Lab") return;

  const viewer =
    viewerRef.current?.ej2Instances || viewerRef.current;
  if (!viewer) return;

  const LAB_EDITABLE_FIELDS = [
    "bloodattach",
    "urineattach",
    "ecgattach",
    "ctattach",
    "mriattach",
    "xrayattach",
    "ultrasoundattach",
    "endoscopyattach",
    "biopsyattach",
    "bronchoscopyattach",
    "bloodtest",
    "urinetest",
    "ecg",
    "ctscan",
    "mri",
    "xray",
    "ultrasound",
    "endoscopy",
    "biopsy",
    "bronchoscopy"
  ];

  const fields =
    viewer.formFieldCollections ||
    viewer.retrieveFormFields?.() ||
    [];

  const normalized = Array.isArray(fields)
    ? fields
    : Object.values(fields);

  normalized.forEach((field) => {
    const name = (field.name || "").toLowerCase();

    // ✅ EXACT MATCH ONLY
    const shouldBeEditable = LAB_EDITABLE_FIELDS.includes(name);

    viewer.formDesignerModule?.updateFormField(field.id, {
      isReadOnly: !shouldBeEditable,
      isEnabled: shouldBeEditable
    });
  });
};
  const resourcesLoaded = async () => {
    try {
      const viewer =
        viewerRef.current?.ej2Instances || viewerRef.current;
      if (!viewer) {
        console.warn("Pdfviewerpage: Viewer not ready yet");
        return;
      }
      if (!adminFilledPdfName) {
        console.warn("Pdfviewerpage: No adminFilledPdfName set");
        return;
      }

      const resp = await fetch(
        `${API_BASE}/api/Authentication/GetPdfStream/${encodeURIComponent(adminFilledPdfName)}`,
        { cache: "no-cache" }
      );

      if (!resp.ok) {
        console.error(`Pdfviewerpage: Failed to fetch PDF: ${resp.status}`, adminFilledPdfName);
        return;
      }

      const blob = await resp.blob();
      if (blob.size === 0) {
        console.error("Pdfviewerpage: PDF blob is empty");
        return;
      }
      const blobUrl = URL.createObjectURL(blob);

      // ✅ Small delay for viewer readiness
      await new Promise(resolve => setTimeout(resolve, 100));

      if (viewer.load) {
        viewer.load(blobUrl, null);
        
// setTimeout(() => {
//     syncTestFieldsToAttachments();
//   }, 300);

      } else if (viewer.open) {
        viewer.open(blobUrl);
      }
    } catch (e) {
      console.error("Pdfviewerpage: Error loading PDF:", e);
    }
  };
  const handler = (e) => {
    const el = e.target.closest("input, textarea");
    if (!el) return;

    // ✅ get field name
    const fieldName =
      (el.getAttribute("name") ||
        el.getAttribute("data-name") ||
        "").toLowerCase();

    // ✅ Only attachment fields should trigger viewer
    if (!HEALTHCARE_ATTACH_FIELDS.includes(fieldName)) return;

    // ✅ If field is editable, do not auto-open (allow typing)
    const isReadOnly =
      el.hasAttribute("readonly") ||
      el.getAttribute("aria-readonly") === "true";

    if (!isReadOnly && !(e.ctrlKey || e.metaKey)) return;

    const value = (el.value || "").trim();
    if (!value) return;

    openAttachmentByTextboxValue(value);
  };

  useEffect(() => {
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  useEffect(() => {
    if (adminFilledPdfName) {
      resourcesLoaded();
    }
  }, [adminFilledPdfName]);

  /* ==============================
     ✅ Find Target Attachment Field Based on Checked Tests
  ============================== */
  const findTargetAttachmentField = () => {
    const viewer = viewerRef.current?.ej2Instances || viewerRef.current;
    if (!viewer) return null;

    const fields = viewer?.retrieveFormFields?.() || [];
    const fieldMap = {};
  
    fields.forEach((f) => {
      const name = (f.name || "").toLowerCase();
      fieldMap[name] = f;
    });

    for (const [testName, attachName] of Object.entries(TEST_TO_ATTACHMENT_MAP)) {
      const testField = fieldMap[testName];
      if (testField) {
        const isChecked = testField.isSelected === true || testField.isChecked === true;
      } else {
      }
    }
    HEALTHCARE_ATTACH_FIELDS.forEach((attachName) => {
      const attachField = fieldMap[attachName];
      if (attachField) {
      } else {
      }
    });

    for (const [testName, attachName] of Object.entries(TEST_TO_ATTACHMENT_MAP)) {
      const testField = fieldMap[testName];
      const attachField = fieldMap[attachName];

      if (!testField) {
        continue;
      }

      // ✅ Check both isSelected and isChecked
      const isTestChecked = testField?.isSelected === true || testField?.isChecked === true;
      const isAttachmentEmpty = !attachField?.value;

      // ✅ If test is checked AND attachment field is empty, this is our target
      if (isTestChecked && attachField && isAttachmentEmpty) {
        return attachField;
      }
    }

    for (const f of fields) {
      const name = (f.name || "").toLowerCase();
      if (!HEALTHCARE_ATTACH_FIELDS.includes(name)) continue;
      if (!f.value) {
        return f;
      }
    }
    return null;
  };

  /* ==============================
     ✅ Stamp File Selection
  ============================== */
  const onStampFileChange = async (evt) => {
    const file = evt.target.files?.[0];
    if (!file) return;

    const viewer = viewerRef.current?.ej2Instances || viewerRef.current;
    if (!viewer) return;

    // ✅ Find the correct target attachment field based on checked tests
    const target = findTargetAttachmentField();

    if (target) {
      const fieldName = target.name.toLowerCase();
      const fileName = file.name;

      /** ✅ ONLY store locally */
      pendingAttachmentsRef.current.set(fieldName, file);

      healthcareFileStoreRef.current.set(fieldName, {
        file,
        url: URL.createObjectURL(file)
      });

      /** ✅ Update textbox value with proper method */
      try {
        // Get fresh field reference to ensure proper update
        const freshFields = viewer.retrieveFormFields?.() || [];
        const freshTarget = freshFields.find(f => f.name.toLowerCase() === fieldName);

        if (freshTarget && freshTarget.id) {
          // Use formDesigner to properly update the field
          viewer.formDesignerModule?.updateFormField(freshTarget.id, {
            value: fileName
          });

          // Trigger property change to sync state
          setTimeout(() => {
            const updatedField = viewer.retrieveFormFields?.()?.find(f => f.name.toLowerCase() === fieldName);
            if (updatedField) {
              checkDoctorSignature(updatedField);
            }
          }, 100);
        }
      } catch (e) {
        console.error("Error updating field:", e);
      }
    } else {
      console.warn("⚠️ No suitable attachment field found");
    }

    evt.target.value = "";
  };

  /* ==============================
     ✅ Click Textbox → Open Viewer
  ============================== */
  const CLICKABLE_FIELD_NAMES = HEALTHCARE_ATTACH_FIELDS;
  const onFormFieldClick = (args) => {
    try {
      const fieldName =
        (args?.field?.name || args?.fieldName || "").toLowerCase();

      if (!HEALTHCARE_ATTACH_FIELDS.includes(fieldName)) return;

      const value =
        (args?.field?.value || args?.value || "").toString().trim();
      if (!value) return;

      const viewer =
        viewerRef.current?.ej2Instances || viewerRef.current;
      if (!viewer) return;

      /** ✅ CASE 1: Newly added attachment (local, not saved yet) */
      const localEntry = healthcareFileStoreRef.current.get(fieldName);
      if (localEntry?.file?.name === value && localEntry.url) {
        setModalSrc(localEntry.url);
        setModalFileName(localEntry.file.name);
        return; // ✅ DO NOT touch main viewer
      }

      /** ✅ CASE 2: Existing attachment from server */
      originalPdfRef.current = adminFilledPdfName;
      isViewingAttachmentRef.current = true;

      const pdfFile = adminFilledPdfName.endsWith(".pdf")
        ? adminFilledPdfName
        : `${adminFilledPdfName}.pdf`;

      const attachmentUrl =
        `${API_BASE}/api/Authentication/GetPdfAttachmentFile/` +
        `${encodeURIComponent(pdfFile)}/` +
        `${encodeURIComponent(value)}`;

      viewer.load(attachmentUrl, null);
    } catch (e) {
      console.warn("Attachment open failed", e);
    }
  };
  const handleBack = () => {
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;

    // ✅ Bill → back to patient form
    if (isViewingBill) {
      setIsViewingBill(false);
      resourcesLoaded(); // reload patient PDF
      return;
    }

    // ✅ EXISTING attachment logic (UNCHANGED)
    if (isViewingAttachmentRef.current && originalPdfRef.current) {
      isViewingAttachmentRef.current = false;
      viewer.load(
        `${API_BASE}/api/Authentication/GetPdfStream/${encodeURIComponent(
          originalPdfRef.current
        )}`
      );
      return;
    }

    // ✅ normal back → dashboard
    onBack();
  };
  const getNextPdfFileName = (status) => {
    const base = (patient?.patientId || patient?.id || "Patient");
    return `New_Patient_Form_${base}_${status}_${Date.now()}.pdf`;
  };
  /* ==============================
     ✅ Submit Logic (unchanged)
  ============================== */
  const handleDoctorSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // ✅ Save latest form
      const finalPdf = await savePdf("FINAL_DOCTOR");
      
      // ✅ Update patient object with new PDF filename
      const patients = JSON.parse(localStorage.getItem("patients") || "[]");
      const idx = patients.findIndex(
        p => String(p.patientId) === String(patient.patientId)
      );
      if (idx !== -1) {
        patients[idx].formPdf = finalPdf;  // ✅ Store new filename
        patients[idx].status = "Treatment Completed";
        patients[idx].lastUpdated = new Date().toLocaleString();
        localStorage.setItem("patients", JSON.stringify(patients));
        window.dispatchEvent(new Event("patientsUpdated"));
      }
      
      onBack();
    } finally {
      setIsSubmitting(false);
    }
  };
  const savePdf = async (stage) => {
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;
    if (!viewer) return;
    const blob = await viewer.saveAsBlob();
    const base64 = await new Promise(res => {
      const r = new FileReader();
      r.onloadend = () => res(r.result);
      r.readAsDataURL(blob);
    });
    const pid = patient?.patientId || patient?.id;
    const fileName = `New_Patient_Form_${pid}_${stage}.pdf`;
    await fetch(`${API_BASE}/api/Authentication/SaveFilledForms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base64,
        fileName,
        documentId: pid,
        username: user?.role,
        status: stage
      })
    });
    return fileName;
  };
  const updatePatientStatus = (patientId, status) => {
    const patients = JSON.parse(localStorage.getItem("patients") || "[]");

    const idx = patients.findIndex(
      p => String(p.patientId) === String(patientId)
    );
    if (idx !== -1) {
      patients[idx].status = status;
      patients[idx].lastUpdated = new Date().toLocaleString();
      localStorage.setItem("patients", JSON.stringify(patients));
      window.dispatchEvent(new Event("patientsUpdated"));
    }
  };
  const CUSTOM_STAMP_NAME = 'Add Attachment'
  const onAnnotationSelect = React.useCallback((args) => {
    if (!args) return;

    const isStamp = args.annotationCollection && args.annotationCollection[0]?.shapeAnnotationType === 'stamp';
    
    if (!isStamp) return;

    // ✅ Reset file input and trigger click
    if (stampFileInputRef.current) {
      stampFileInputRef.current.value = '';
      // Use a small delay to ensure UI refresh
      setTimeout(() => {
        stampFileInputRef.current?.click();
      }, 0);
    } else {
      console.warn("⚠️ stampFileInputRef is not available");
    }

    // re-evaluate fields after an annotation interaction (covers drawn signatures)
  }, [])
  const handleAnnotationDoubleClick = (args) => {
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;
    viewer?.toolbar.showAnnotationToolbar(false)
  }

  const openAttachmentByTextboxValue = (value) => {
    if (!value) return;

    for (const stored of healthcareFileStoreRef.current.values()) {
      if (stored?.file?.name === value && stored.url) {
        setModalSrc(stored.url);
        setModalFileName(stored.file.name);
        return;
      }
    }
  };
  const handleLabTestRequest = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // syncTestFieldsToAttachments();
      const latestPdf = await savePdf("LAB");
      
      // ✅ CRITICAL: Update patient object with new PDF filename
      const patients = JSON.parse(localStorage.getItem("patients") || "[]");
      const idx = patients.findIndex(
        p => String(p.patientId) === String(patient.patientId)
      );
      if (idx !== -1) {
        patients[idx].formPdf = latestPdf;  // ✅ Store new filename
        patients[idx].status = "Lab Requested";
        patients[idx].lastUpdated = new Date().toLocaleString();
        localStorage.setItem("patients", JSON.stringify(patients));
        window.dispatchEvent(new Event("patientsUpdated"));
      }
      
      setAdminFilledPdfName(latestPdf);
      await savePdf("LAB_ATTACH");
      onBack();
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleLabSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const viewer =
        viewerRef.current?.ej2Instances || viewerRef.current;
      if (!viewer) return;
      // ✅ Save current PDF state (fields included)
      const blob = await viewer.saveAsBlob();
      const base64 = await new Promise((res) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result);
        r.readAsDataURL(blob);
      });
      // ✅ Collect pending attachments (SAME as doctor submit)
      const attachments = [];
      for (const file of pendingAttachmentsRef.current.values()) {
        const attachmentBase64 = await new Promise((res) => {
          const r = new FileReader();
          r.onloadend = () =>
            res((r.result || "").split(",")[1] || "");
          r.readAsDataURL(file);
        });
        attachments.push({
          name: file.name,
          base64: attachmentBase64,
          type: file.type || "application/pdf",
          originalName: file.name
        });
      }
      const patientId = patient?.patientId || patient?.id;
      // ✅ LAB-specific filename
      const fileName = `New_Patient_Form_${patientId}_LAB_ATTACH.pdf`;
      await fetch(`${API_BASE}/api/Authentication/SaveFilledForms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64,
          fileName,
          documentId: patientId,
          customerName: patient?.name || "Patient",
          username: user?.role || "Lab",
          status: "LAB_ATTACH",
          attachments
        })
      });

      // ✅ Update patient object with new PDF filename
      const patients = JSON.parse(localStorage.getItem("patients") || "[]");
      const idx = patients.findIndex(
        p => String(p.patientId) === String(patientId)
      );
      if (idx !== -1) {
        patients[idx].formPdf = fileName;  // ✅ Store new filename
        patients[idx].status = "Report Uploaded";
        patients[idx].lastUpdated = new Date().toLocaleString();
        localStorage.setItem("patients", JSON.stringify(patients));
        window.dispatchEvent(new Event("patientsUpdated"));
      }

      // ✅ Cleanup (IMPORTANT)
      pendingAttachmentsRef.current.clear();
      for (const v of healthcareFileStoreRef.current.values()) {
        try {
          URL.revokeObjectURL(v.url);
        } catch { }
      }
      healthcareFileStoreRef.current.clear();
      onBack();
    } finally {
      setIsSubmitting(false);
    }
  };
  const checkDoctorSignature = (changedField) => {
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;
    if (!viewer) return;

    // ✅ Get all form fields
    let fields =
      viewer.formFieldCollections ||
      viewer.retrieveFormFields?.();
    if (!fields) {
      setDoctorSigned(false);
      setAdminSigned(false);
      return;
    }
    // ✅ Normalize to array
    if (!Array.isArray(fields)) {
      fields = Object.values(fields);
    }
    let doctorHasSigned = false;
    let adminHasSigned = false;
    fields.forEach((field) => {
      if (field?.type !== "SignatureField") return;

      const name = (field.name || "").toLowerCase();
      const hasValue =
        typeof field.value === "string" && field.value.trim().length > 0;
      if (!hasValue) return;
      // ✅ Doctor signature
      if (!doctorHasSigned && name.includes("doctor")) {
        doctorHasSigned = true;
      }
      // ✅ Admin signature (bill)
      if (!adminHasSigned && name.includes("admin")) {
        adminHasSigned = true;
      }
    });
    setDoctorSigned(doctorHasSigned);
    setAdminSigned(adminHasSigned);

    // ✅ NEW: Sync test fields to attachments when checkbox changes
    syncTestToAttachmentOnChange(changedField);
  };

  // ✅ NEW: Dynamic sync - triggered when a checkbox field changes
  const syncTestToAttachmentOnChange = (changedField) => {
    const viewer = viewerRef.current?.ej2Instances || viewerRef.current;
    if (!viewer || !changedField) return;

    const fields = viewer.retrieveFormFields?.() || [];
    if (!fields || fields.length === 0) return;

    // ✅ Get the name of the checkbox that changed
    const changedFieldName = (changedField.name || "").toLowerCase().trim();
    
    // ✅ Only process if it's a checkbox field
    if (changedField.formFieldAnnotationType
 !== "Checkbox") {
      return;
    }

    // ✅ Check both isSelected and isChecked properties
    const isCheckboxChecked = changedField.isSelected === true || changedField.isChecked === true;

    // ✅ Find all attachment fields that include this checkbox name
    const matchingAttachmentFields = fields.filter(f => {
      if (!f || !f.name) return false;
      const fname = (f.name || "").toLowerCase().trim();
      // Include this attachment field if its name contains part of the checkbox name
      return fname.includes(changedFieldName.replace("test", "").replace("scan", "").trim()) || 
             fname.includes(changedFieldName.split(" ")[0]); // match first word
    });
    matchingAttachmentFields.forEach(af => {
    });

    // ✅ Enable or disable matching attachment fields
    matchingAttachmentFields.forEach(attachmentField => {
      if (isCheckboxChecked) {
        // ✅ Checkbox is CHECKED → Enable attachment field
        viewer.formDesignerModule?.updateFormField(attachmentField.id, {
          isReadOnly: false,
          isEnabled: true
        });
      } else {
        // ✅ Checkbox is UNCHECKED → Disable attachment field and clear value
        viewer.formDesignerModule?.updateFormField(attachmentField.id, {
          value: "",
          isReadOnly: true,
          isEnabled: false
        });
      }
    });
  };

  const handleViewBill = async () => {
    const billFile = `Patient_Bill_${patient.patientId}.pdf`;
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;
    if (!viewer) return;
    const res = await fetch(
      `${API_BASE}/api/Authentication/GetPdfStream/${encodeURIComponent(
        billFile
      )}`
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    viewer.load(url, null);
    setIsViewingBill(true);
  };
  const loadPdfFromServer = async (fileName) => {
    if (!fileName) return;

    const res = await fetch(
      `${API_BASE}/api/Authentication/GetPdfStream/${encodeURIComponent(fileName)}`
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;

    viewer?.load(url);
  };
  const handleGenerateBill = async () => {
    // ✅ Extract from medical PDF (this part already works)
    const medicalData = getPatientDataFromMedicalPdf();

    // ✅ Load bill template programmatically
    await loadPdfFromServer("bill.pdf");

    // ✅ WAIT until Syncfusion internally initializes bill form fields
    waitForBillFormReady(() => {
      fillBillPdfFields({
        name: medicalData.name,
        age: medicalData.age,
        physician: medicalData.physician
      });
    });

    setShowBill(true);
    setBillPdfName(`Patient_Bill_${patient.patientId}.pdf`);
  };
  const getCurrentDate = () => {
    const d = new Date();

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    return `${day}/${month}/${year}`; // ✅ DD/MM/YYYY
  };
  const waitForBillFormReady = (callback, retries = 20) => {
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;

    if (
      viewer &&
      viewer.formDesignerModule &&
      Array.isArray(viewer.formFieldCollections) &&
      viewer.formFieldCollections.length > 0
    ) {
      callback();
      return;
    }

    if (retries > 0) {
      setTimeout(() => {
        waitForBillFormReady(callback, retries - 1);
      }, 200);
    } else {
      console.error("Bill PDF form fields not ready");
    }
  };
  const handleSubmitBill = async () => {
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;

    if (!viewer) return;

    // ✅ 1. Save bill PDF properly
    const blob = await viewer.saveAsBlob();
    const base64 = await new Promise((res) => {
      const r = new FileReader();
      r.onloadend = () => res(r.result);
      r.readAsDataURL(blob);
    });

    const billFileName = `Patient_Bill_${patient.patientId}.pdf`;
    await fetch(`${API_BASE}/api/Authentication/SaveFilledForms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base64,
        fileName: billFileName,
        documentId: patient.patientId,
        username: user?.role || "Admin",
        status: "BILL_PAID"
      })
    });

    // ✅ 2. Update patient status (existing logic)
    const patients = JSON.parse(localStorage.getItem("patients") || "[]");
    const idx = patients.findIndex(
      (p) => String(p.patientId) === String(patient.patientId)
    );
    if (idx !== -1) {
      patients[idx].status = "Bill Paid";
      patients[idx].lastUpdated = new Date().toLocaleString();
      localStorage.setItem("patients", JSON.stringify(patients));
      window.dispatchEvent(new Event("patientsUpdated"));
    }

    // ✅ 3. Return to dashboard (unchanged)
    onBack();
  };
  const getPatientDataFromMedicalPdf = () => {
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;

    const fields = viewer?.retrieveFormFields?.() || [];

    const data = {
      name: "",
      age: "",
      physician: ""
    };

    fields.forEach(f => {
      const fieldName = (f.name || "").toLowerCase();

      if (fieldName.includes("name")) data.name = f.value;
      if (fieldName.includes("age")) data.age = f.value;
      if (fieldName.includes("physician")) data.physician = f.value;
    });

    return data;
  };
  const fillBillPdfFields = (data) => {
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;
    const currentDate = getCurrentDate();
    viewer.formFieldCollections.forEach((field) => {
      const name = (field.name || "").toLowerCase();
      let value = null;

      if (name === "name") value = data.name;
      if (name === "age") value = data.age;
      if (name === "physician") value = data.physician;
      if (name === "id") value = patient.patientId;
      if (name === "date") value = currentDate;
      if (value !== null) {
        viewer.formDesignerModule.updateFormField(field.id, { value });
      }
    });
  };
  const checkAdminSignature = () => {
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;
    if (!viewer) return;

    let fields =
      viewer.formFieldCollections ||
      viewer.retrieveFormFields?.();

    if (!fields) {
      setAdminSigned(false);
      return;
    }
    // ✅ Normalize to array
    if (!Array.isArray(fields)) {
      fields = Object.values(fields);
    }

    const signed = fields.some((f) => {
      const name = (f?.name || "").toLowerCase();
      return (
        name.includes("admin") &&
        f?.type === "SignatureField" &&
        typeof f.value === "string" &&
        f.value.trim().length > 0
      );
    });

    setAdminSigned(signed);
  };
 const getToolbarSettingsByRole = (role) => {
  const r = String(role || "").toLowerCase();

  // ✅ ADMIN + Registered → restricted toolbar
  if (r === "admin" && patient?.status === "Registered") {
    return {
      showTooltip: true,
      toolbarItems: [
        "PageNavigationTool",
        "PanTool",
        "MagnificationTool"
      ]
    };
  }

  // ✅ ADMIN (other statuses)
  if (r === "admin") {
    return {
      showTooltip: true,
      toolbarItems: [
        "PageNavigationTool",
        "PanTool",
        "MagnificationTool",
        "DownloadOption",
        "PrintOption"
      ]
    };
  }

  // ✅ Doctor & Lab (unchanged)
  return {
    showTooltip: true,
    toolbarItems: [
      "PageNavigationTool",
      "PanTool",
      "MagnificationTool"
    ]
  };
};
  // ✅ DEPRECATED: Old static mapping - now using dynamic syncTestToAttachmentOnChange
  const syncTestValuesToAttachments = () => {
  };

  const onDocumentLoad = () => {
    for (var i = 0; i < viewerRef.current.annotationCollection.length; i++) {
      if (viewerRef.current.annotationCollection[i].shapeAnnotationType == 'stamp') {
        viewerRef.current.annotationCollection[i].allowedInteractions = ['Select'];
        viewerRef.current.annotation.editAnnotation(viewerRef.current.annotationCollection[i]);
      }
    }
    setTimeout(() => {
      applyDoctorReadOnlyRules();
      applyLabReadOnlyRules();
      applyAdminTreatmentCompletedRules(); 
      applyBillPaidReadOnlyRules();
      applyDoctorTreatmentCompletedRules(); 
    }, 300)
  }
  const applyBillPaidReadOnlyRules = () => {
  if (patient?.status !== "Bill Paid") return;

  const viewer =
    viewerRef.current?.ej2Instances || viewerRef.current;
  if (!viewer) return;

  const BILL_PAID_EDITABLE_FIELDS = [
    "bloodattach",
    "urineattach",
    "ecgattach",
    "ctattach",
    "mriattach",
    "xrayattach",
    "ultrasoundattach",
    "endoscopyattach",
    "biopsyattach",
    "bronchoscopyattach"
  ];

  const fields =
    viewer.formFieldCollections ||
    viewer.retrieveFormFields?.() ||
    [];

  const normalized = Array.isArray(fields)
    ? fields
    : Object.values(fields);

  normalized.forEach((field) => {
    const name = (field.name || "").toLowerCase();

    // ✅ EXACT MATCH ONLY — no partial conflicts
    const shouldBeEditable =
      BILL_PAID_EDITABLE_FIELDS.includes(name);

    viewer.formDesignerModule?.updateFormField(field.id, {
      isReadOnly: !shouldBeEditable,
      isEnabled: shouldBeEditable
    });
  });
};
const applyDoctorTreatmentCompletedRules = () => {
  if (user?.role !== "Doctor") return;
  if (patient?.status !== "Treatment Completed") return;

  const viewer =
    viewerRef.current?.ej2Instances || viewerRef.current;
  if (!viewer) return;

  const EDITABLE_FIELDS_TC_DOCTOR = [
    "bloodattach",
    "urineattach",
    "ecgattach",
    "ctattach",
    "mriattach",
    "xrayattach",
    "ultrasoundattach",
    "endoscopyattach",
    "biopsyattach",
    "bronchoscopyattach"
  ];

  const fields =
    viewer.formFieldCollections ||
    viewer.retrieveFormFields?.() ||
    [];

  const normalized = Array.isArray(fields)
    ? fields
    : Object.values(fields);

  normalized.forEach((field) => {
    const name = (field.name || "").toLowerCase();

    const shouldBeEditable =
      EDITABLE_FIELDS_TC_DOCTOR.includes(name);

    viewer.formDesignerModule?.updateFormField(field.id, {
      isReadOnly: !shouldBeEditable,
      isEnabled: shouldBeEditable
    });
  });
};
  const applyAdminTreatmentCompletedRules = () => {
  if (user?.role !== "Admin") return;
  if (patient?.status !== "Treatment Completed") return;

  const viewer =
    viewerRef.current?.ej2Instances || viewerRef.current;
  if (!viewer) return;

  const ADMIN_TC_EDITABLE_FIELDS = [
    "bloodattach",
    "urineattach",
    "ecgattach",
    "ctattach",
    "mriattach",
    "xrayattach",
    "ultrasoundattach",
    "endoscopyattach",
    "biopsyattach",
    "bronchoscopyattach",
    "consulatationcharge",
    "treatmentcharge",
    "medicationcharge",
    "roomcharge",
    "totalamount",
    "adminsign"
  ];

  const fields =
    viewer.formFieldCollections ||
    viewer.retrieveFormFields?.() ||
    [];

  const normalized = Array.isArray(fields)
    ? fields
    : Object.values(fields);

  normalized.forEach((field) => {
    const name = (field.name || "").toLowerCase();

    // ✅ EXACT MATCH ONLY
    const shouldBeEditable =
      ADMIN_TC_EDITABLE_FIELDS.includes(name);

    viewer.formDesignerModule?.updateFormField(field.id, {
      isReadOnly: !shouldBeEditable,
      isEnabled: shouldBeEditable
    });
  });
};
  /* ==============================
     ✅ Render
  ============================== */
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <h3 style={{ margin: 0 }}>
          {patient?.name || "Patient"}
        </h3>
        <button
          onClick={handleBack}   // ✅ IMPORTANT
          aria-label="Close"
          style={{
            background: "transparent",
            border: "none",
            fontSize: "20px",
            fontWeight: 600,
            cursor: "pointer",
            lineHeight: 1,
            padding: "4px 8px",
            borderRadius: 6
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1 }}>
        <PdfViewerComponent
          ref={(inst) => (viewerRef.current = inst)}
          resourceUrl="https://cdn.syncfusion.com/ej2/31.2.2/dist/ej2-pdfviewer-lib"
          enableToolbar={true}
          toolbarSettings={getToolbarSettingsByRole(user?.role)}
          resourcesLoaded={resourcesLoaded}
          annotationSelect={onAnnotationSelect}
          annotationDoubleClick={handleAnnotationDoubleClick}
          formFieldClick={onFormFieldClick}
          enableLocalStorage={true}
          documentLoad={onDocumentLoad}
          formFieldPropertiesChange={(args) => {
            checkDoctorSignature(args?.field || args);
          }}
          style={{ width: "100%", height: "100%" }}
        >
          <Inject
            services={[
              Toolbar,
              Magnification,
              Navigation,
              LinkAnnotation,
              BookmarkView,
              ThumbnailView,
              Print,
              TextSelection,
              TextSearch,
              Annotation,
              FormFields,
              FormDesigner,
              PageOrganizer
            ]}
          />
        </PdfViewerComponent>
      </div>

      {/* ==============================
✅ Action Buttons (Hidden after Final Bill)
============================== */}

      {patient?.status !== "Bill Paid" && !isViewingBill && !modalSrc && (
        <div
          style={{
            padding: 12,
            textAlign: "right",
            display: "flex",
            gap: 12,
            justifyContent: "flex-end"
          }}
        >
       {user?.role === "Doctor" &&
  patient?.status !== "Treatment Completed" && (
    <>
      <button
        onClick={handleLabTestRequest}
        disabled={isSubmitting}
        style={{
          backgroundColor: "#2563eb",   // ✅ blue
          color: "#ffffff",
          padding: "8px 16px",
          borderRadius: "6px",
          border: "none",
          fontWeight: 600,
          cursor: "pointer",
          marginRight: "8px",
          opacity: isSubmitting ? 0.6 : 1
        }}
      >
        Request Lab Tests
      </button>

      <button
        onClick={handleDoctorSubmit}
        disabled={!doctorSigned || isSubmitting}
        style={{
          backgroundColor: "#2563eb",   // ✅ blue
          color: "#ffffff",
          padding: "8px 16px",
          borderRadius: "6px",
          border: "none",
          fontWeight: 600,
          cursor:
            !doctorSigned || isSubmitting
              ? "not-allowed"
              : "pointer",
          opacity:
            !doctorSigned || isSubmitting ? 0.5 : 1
        }}
      >
        Treatment Completed
      </button>
    </>
)}
            
      
          {/* ✅ Lab Action */}
          {user?.role === "Lab" && patient?.status !== "Report Uploaded" && patient?.status !== "Treatment Completed" && (
            <button
              onClick={handleLabSubmit}
              disabled={isSubmitting}
              style={{
                background: "#16a34a",
                color: "#fff",
                padding: "10px 28px",
                borderRadius: 8,
                border: "none",
                fontWeight: 600
              }}
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
          )}

          {/* ✅ Admin – Generate Bill */}
          {user?.role === "Admin" &&
            patient?.status === "Treatment Completed" &&
            !showBill && (
              <button
                onClick={handleGenerateBill}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  padding: "10px 28px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Generate Bill
              </button>
            )}

          {/* ✅ Admin – Submit Bill */}
          {user?.role === "Admin" &&
            showBill &&
            patient?.status !== "Bill Paid" && (
              <button
                onClick={handleSubmitBill}
                disabled={!adminSigned}
                style={{
                  background: adminSigned ? "#16a34a" : "#9ca3af",
                  color: "#fff",
                  padding: "10px 28px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: 600,
                  cursor: adminSigned ? "pointer" : "not-allowed",
                  opacity: adminSigned ? 1 : 0.6
                }}
              >
                Submit Bill
              </button>
            )}
        </div>
      )}
      {/* ✅ Admin – Generate Bill Button */}

      {!modalSrc && (
      <div style={{
        padding: 12,
        textAlign: "right",
        display: "flex",
        gap: 12,
        justifyContent: "flex-end"
      }}>
        {user?.role === "Admin" &&
          patient?.status === "Bill Paid" &&
          !isViewingBill && (    // ✅ THIS LINE HIDES IT AFTER CLICK

            <button
              onClick={handleViewBill}
              style={{
                background: "#2563eb",
                color: "#fff",
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                fontWeight: 600,

                cursor: "pointer",
                fontSize: 14
              }}
            >
              View Bill
            </button>
          )}
      </div>
      )}

      {/* ✅ Hidden Inputs */}
      <input
        type="file"
        ref={stampFileInputRef}
        style={{ display: "none" }}
        onChange={onStampFileChange}
      />

      {/* ✅ Attachment Viewer */}
      {modalSrc && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "85%",
              height: "85%",
              background: "#fff",
              display: "flex",
              flexDirection: "column",
              borderRadius: 6,
              overflow: "hidden"
            }}
          >
            {/* Header */}
            <div
              style={{
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 14px",
                borderBottom: "1px solid #e5e7eb",
                background: "#f9fafb",
                fontWeight: 600
              }}
            >
              <div style={{ flex: 1, textAlign: "center" }}>
                {modalFileName}
              </div>
              <button
                onClick={closeModal}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 18,
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>

            {/* Viewer */}
            <div style={{ flex: 1 }}>
              <PdfViewerComponent
                documentPath={modalSrc}
                resourceUrl="https://cdn.syncfusion.com/ej2/31.2.2/dist/ej2-pdfviewer-lib"
                enableToolbar={true}

                toolbarSettings={getToolbarSettingsByRole(user?.role)}
                style={{ width: "100%", height: "100%" }}
              >
                <Inject services={[Toolbar, Magnification, Navigation, Print]} />
              </PdfViewerComponent>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

