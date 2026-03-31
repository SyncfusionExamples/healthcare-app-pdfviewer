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

export default function Pdfviewerpage({ user, patient, onBack }) {
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

        const res = await fetch(
          `${API_BASE}/api/Authentication/GetUserFiles?username=ALL`,
          { cache: "no-cache" }
        );
        const files = await res.json();
        // ✅ Only PDFs for this patient
        const patientFiles = files.filter(f =>
          typeof f.fileName === "string" &&
          f.fileName.includes(`_${pid}`)
        );

        if (patientFiles.length === 0) {
          console.warn("No PDF found for patient", pid);
          return;
        }
        // ✅ Separate categories
        const finalDoctor = patientFiles.filter(f =>
          f.fileName.includes("_FINAL_DOCTOR")
        );
        const finalLab = patientFiles.filter(f =>
          f.fileName.includes("_FINAL_LAB")
        );
        const labAttach = patientFiles.filter(f =>
          f.fileName.includes("_LAB_ATTACH")
        );
        const lab = patientFiles.filter(f =>
          f.fileName.includes("_LAB_")
        );

        // ✅ ADMIN = base file (no stage suffix)
        const admin = patientFiles.filter(f =>
          !f.fileName.includes("_LAB") &&
          !f.fileName.includes("_FINAL")
        );
        const sortNewest = (a, b) =>
          new Date(b.createdAt) - new Date(a.createdAt);
        // ✅ Priority order
        if (finalLab.length) {
          setAdminFilledPdfName(finalLab.sort(sortNewest)[0].fileName);
          return;
        }
        if (finalDoctor.length) {
          setAdminFilledPdfName(finalDoctor.sort(sortNewest)[0].fileName);
          return;
        }
        if (labAttach.length) {
          setAdminFilledPdfName(labAttach.sort(sortNewest)[0].fileName);
          return;
        }
        if (lab.length) {
          setAdminFilledPdfName(lab.sort(sortNewest)[0].fileName);
          return;
        }

        // ✅ FALLBACK → Admin PDF (THIS FIXES YOUR ISSUE)
        admin.sort(sortNewest);
        setAdminFilledPdfName(admin[0].fileName);

      } catch (err) {
        console.error("PDF resolution failed", err);
      }
    };
    loadCorrectPdf();
  }, [patient, API_BASE]);

  const resourcesLoaded = async () => {
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;
    if (!viewer || !adminFilledPdfName) return;
    const resp = await fetch(
      `${API_BASE}/api/Authentication/GetPdfStream/${encodeURIComponent(adminFilledPdfName)}`,
      { cache: "no-cache" }
    );
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    viewer.load(blobUrl, null);
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
    if (adminFilledPdfName) resourcesLoaded();
  }, [adminFilledPdfName]);

  /* ==============================
     ✅ Stamp File Selection
  ============================== */
  const onStampFileChange = async (evt) => {
    const file = evt.target.files?.[0];
    if (!file) return;

    const viewer = viewerRef.current?.ej2Instances || viewerRef.current;
    const fields = viewer?.retrieveFormFields?.() || [];

    let target = null;
    for (const f of fields) {
      const name = (f.name || "").toLowerCase();
      if (!HEALTHCARE_ATTACH_FIELDS.includes(name)) continue;
      if (!f.value) {
        target = f;
        break;
      }
      if (!target) target = f;
    }

    if (target) {
      /** ✅ ONLY store locally */
      pendingAttachmentsRef.current.set(target.name.toLowerCase(), file);

      healthcareFileStoreRef.current.set(target.name.toLowerCase(), {
        file,
        url: URL.createObjectURL(file)
      });
      /** ✅ Update textbox value */
      target.value = file.name;
      viewer.updateFormFieldsValue(target);
      viewer.formDesignerModule?.updateFormField(target, { value: file.name });
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
      await savePdf("FINAL_DOCTOR");
      updatePatientStatus(patient.patientId, "Treatment Completed")
      // ✅ existing attachment logic can stay (if needed)
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
    if (!args) return
    const shapeType = args.shapeAnnotationType || args.annotation?.shapeAnnotationType || null
    const { annotationType, annotation } = args;
    const isStamp = args.annotationCollection && args.annotationCollection[0].shapeAnnotationType == 'stamp';
    if (!isStamp) return
    const isOurCustomStamp = annotation?.customStampName === CUSTOM_STAMP_NAME || annotation?.subject === CUSTOM_STAMP_NAME
    // if (!isOurCustomStamp) return
    if (stampFileInputRef.current) { stampFileInputRef.current.value = ''; setTimeout(() => stampFileInputRef.current?.click(), 0) }
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
      const latestPdf = await savePdf("LAB");
      updatePatientStatus(patient.patientId, "Lab Requested");
      setAdminFilledPdfName(latestPdf);
      // ✅ persist mapping
      localStorage.setItem(
        `patient_form_${patient.patientId}`,
        latestPdf
      );
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

      // ✅ Cleanup (IMPORTANT)
      pendingAttachmentsRef.current.clear();
      for (const v of healthcareFileStoreRef.current.values()) {
        try {
          URL.revokeObjectURL(v.url);
        } catch { }
      }
      healthcareFileStoreRef.current.clear();
      updatePatientStatus(patient.patientId, "Report Uploaded");
      onBack();
    } finally {
      setIsSubmitting(false);
    }
  };
  const checkDoctorSignature = () => {
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

    // ✅ Doctor & Lab
    return {
      showTooltip: true,
      toolbarItems: [
        "PageNavigationTool",

        "PanTool",
        "MagnificationTool",
      ]
    };
  };
  const onDocumentLoad = () => {
    for (var i = 0; i < viewerRef.current.annotationCollection.length; i++) {
      if (viewerRef.current.annotationCollection[i].shapeAnnotationType == 'stamp') {
        viewerRef.current.annotationCollection[i].allowedInteractions = ['Select'];
        viewerRef.current.annotation.editAnnotation(viewerRef.current.annotationCollection[i]);
      }
    }
  }
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
          formFieldPropertiesChange={checkDoctorSignature}
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

      {patient?.status !== "Bill Paid" && (
        <div
          style={{
            padding: 12,
            textAlign: "right",
            display: "flex",
            gap: 12,
            justifyContent: "flex-end"
          }}
        >
          {/* ✅ Doctor Actions */}
          {user?.role === "Doctor" && (
            <>
              <button
                onClick={handleLabTestRequest}
                disabled={isSubmitting}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  padding: "10px 22px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Request Lab Tests
              </button>

              <button
                onClick={handleDoctorSubmit}
                disabled={!doctorSigned || isSubmitting}
                style={{
                  background: doctorSigned ? "#2563eb" : "#9ca3af",
                  color: "#fff",
                  padding: "10px 28px",
                  borderRadius: 8,
                  border: "none",
                  cursor: doctorSigned ? "pointer" : "not-allowed"
                }}
              >
                {isSubmitting ? "Submitting..." : "Treatment Completed"}
              </button>
            </>
          )}

          {/* ✅ Lab Action */}
          {user?.role === "Lab" && (
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
