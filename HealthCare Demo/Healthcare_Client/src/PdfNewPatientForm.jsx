import React, { useRef, useMemo, useState, useEffect } from "react";
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
import "./index.css";

export default function PdfNewPatientForm({ user, onBack, onRegister, pdfFileName }) {
  const viewerRef = useRef(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const API_BASE = useMemo(
    () =>
      process.env.REACT_APP_API_URL?.trim() ||
      "http://localhost:5063",
    []
  );
  const effectivePdfName = useMemo(() => {
    if (pdfFileName && pdfFileName.trim()) return pdfFileName.trim();
    return "New_Patient_Form";
  }, [pdfFileName]);
  /** ✅ Generate 2‑digit Patient ID */
  const generatePatientId = () => {
    const key = "patient_id_counter";
    let current = Number(localStorage.getItem(key) || "0") + 1;
    if (current > 99) current = 1;
    localStorage.setItem(key, current);
    return current.toString().padStart(2, "0");
  };
  const waitFor = (cond, timeoutMs = 3000) =>
    new Promise((resolve) => {
      const start = Date.now();
      const t = setInterval(() => {
        if (cond() || Date.now() - start > timeoutMs) {
          clearInterval(t);
          resolve(true);
        }
      }, 50);
    });
  const pdfLoadedRef = useRef(false);

  // ✅ ADD THIS HELPER FUNCTION (anywhere inside the component)
const applyAdminReadOnlyRules = () => {
  if (user?.role !== "Admin") return;

  try {
    const viewer =
      viewerRef.current?.ej2Instances || viewerRef.current;
    if (!viewer) {
      console.warn("Viewer not available for read-only rules");
      return;
    }

    const ADMIN_EDITABLE_FIELDS = [
      "name",
      "lastname",
      "gender",
      "age",
      "phone",
      "anumber",
      "address",
      "physician",
      "time",
      "visit",
      "previousvisit",
      // ❌ intentionally NOT including "nextvisit"
      "temperature",
      "pulse",
      "height",
      "weight",
      "bmi",
      "systolic",
      "diastolic",
      "date"
    ];

    let fields =
      viewer.formFieldCollections ||
      viewer.retrieveFormFields?.() ||
      [];

    // ✅ Safety check
    if (!fields) {
      console.warn("No form fields found");
      return;
    }

    const normalized = Array.isArray(fields)
      ? fields
      : Object.values(fields);

    normalized.forEach((field) => {
      if (!field) return;
      
      const name = (field.name || "").toLowerCase();

      // ✅ EXACT MATCH — no partial collisions
      const shouldBeEditable = ADMIN_EDITABLE_FIELDS.includes(name);

      try {
        viewer.formDesignerModule?.updateFormField(field.id, {
          isReadOnly: !shouldBeEditable,
          isEnabled: shouldBeEditable
        });
      } catch (e) {
        console.warn(`Could not update field ${field.id}:`, e.message);
      }
    });
  } catch (e) {
    console.error("Error in applyAdminReadOnlyRules:", e);
  }
};
const documentLoad = async () => {
  try {
    // ✅ Wait for form fields to be fully initialized
    await new Promise(resolve => setTimeout(resolve, 500));
    applyAdminReadOnlyRules();
  } catch (e) {
    console.error("Error in documentLoad:", e);
  }
};
  const handleResourcesLoaded = async () => {
    try {
      const viewer =
        viewerRef.current?.ej2Instances || viewerRef.current;
      if (!viewer) {
        console.warn("Viewer not ready yet");
        return;
      }

      // ✅ Prevent infinite reload
      if (pdfLoadedRef.current) return;
      
      pdfLoadedRef.current = true;

      const filename = effectivePdfName.toLowerCase().endsWith(".pdf")
        ? effectivePdfName
        : `${effectivePdfName}.pdf`;

      const resp = await fetch(
        `${API_BASE}/api/Authentication/GetPdfStream/${encodeURIComponent(filename)}`
      );
      
      if (!resp.ok) {
        console.error("Failed to fetch PDF:", resp.status);
        pdfLoadedRef.current = false;
        return;
      }

      const blob = await resp.blob();
      if (blob.size === 0) {
        console.error("PDF blob is empty");
        pdfLoadedRef.current = false;
        return;
      }

      const url = URL.createObjectURL(blob);

      // ✅ Small delay to ensure viewer is fully initialized
      await new Promise(resolve => setTimeout(resolve, 100));

      // ✅ Try load first, fallback to open
      if (viewer.load) {
        viewer.load(url, null);
      } else if (viewer.open) {
        viewer.open(url);
      } else {
        console.error("Viewer has no load or open method");
        pdfLoadedRef.current = false;
      }
    } catch (e) {
      console.error("PDF load error:", e);
      pdfLoadedRef.current = false;
    }
  };
  /** ✅ FIXED Submit Logic */
  const handlePdfSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const viewer = viewerRef.current;
      if (!viewer) return;

      // ✅ Read PDF as Blob → Base64
      const blob = await viewer.saveAsBlob();
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });

      // ✅ Extract patient data from fields
      const fields = viewer.retrieveFormFields?.() || [];

      let details = {
        name: "",
        patientId: generatePatientId(),
        dob: "",
        status: "Registered",
        lastUpdated: new Date().toLocaleString(),
      };

      fields.forEach(f => {
        const nameLc = String(f.name || "").toLowerCase();
        const value = String(f.value || "").trim();

        if (
          nameLc === "name" ||
          nameLc.includes("patient name") ||
          nameLc.includes("patientname")
        ) details.name = value;

        if (
          nameLc.includes("patient id") ||
          nameLc.includes("patientid") ||
          nameLc.includes("pid") ||
          nameLc.includes("uhid")
        ) {
          if (value) details.patientId = value;
        }
        if (nameLc.includes("dob") || nameLc.includes("date"))
          details.dob = value;
      });
      if (!details.name) details.name = "Unnamed Patient";
      // ✅ IMPORTANT: build filename AFTER patientId is final
      const fileName = `New_Patient_Form_${details.patientId}.pdf`;
      // ✅ Call your backend API
      await fetch(`${API_BASE}/api/Authentication/SaveFilledForms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64,
          fileName,
          documentId: details.patientId,
          customerName: details.name,
          username: user?.role || "Admin",
          status: "REGISTERED"
        })
      });
      // ✅ Save patient ONCE, with PDF reference
      const patients = JSON.parse(localStorage.getItem("patients") || "[]");

      if (!patients.some(p => p.patientId === details.patientId)) {
        patients.push({
          ...details,
          formPdf: fileName   // ✅ critical link
        });
        localStorage.setItem("patients", JSON.stringify(patients));
      }

      window.dispatchEvent(new Event("patientsUpdated"));
      onRegister?.(details);

    } finally {
      setIsSubmitting(false);
    }
  };

  const getToolbarSettingsForNewPatient = () => {
  if (user?.role === "Admin") {
    return {
      showTooltip: true,
      toolbarItems: [
        "PageNavigationTool",
        "PanTool",
        "MagnificationTool"
      ]
    };
  }

  // fallback (if ever needed)
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
};
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      {/* Header */}
      <div
        style={{
          padding: "12px 20px",
          textAlign: "center",
          position: "relative"
        }}
      >
      </div>
      {/* PDF Viewer */}
      <div style={{ flex: 1 }}>
        <PdfViewerComponent
          id="newPatientFormViewer"
          ref={(inst) => {
            viewerRef.current = inst;
          }}
          resourceUrl="https://cdn.syncfusion.com/ej2/31.2.2/dist/ej2-pdfviewer-lib"
          enableToolbar={true}
          toolbarSettings={getToolbarSettingsForNewPatient()}
          created={() => {
            setViewerReady(true);
          }}
          resourcesLoaded={handleResourcesLoaded}
          documentLoad={documentLoad}
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
              PageOrganizer,
            ]}
          />
        </PdfViewerComponent>
      </div>
      {/* Action Bar */}
      <div className="pdf-actionbar">
        <div className="pdf-actionbar-inner">
          <button
            className="button pdf-action-button approve enabled"
            onClick={handlePdfSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
