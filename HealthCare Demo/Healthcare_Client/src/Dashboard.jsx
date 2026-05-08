import React, { useEffect, useState } from "react";

export default function Dashboard({ user, onOpenReport, onNewPatient }) {
  const [patients, setPatients] = useState([]);

  // Load patients on mount
  useEffect(() => {
    const saved = localStorage.getItem("patients");
    if (saved) {
      try {
        setPatients(JSON.parse(saved));
      } catch {
        setPatients([]);
      }
    }
  }, []);

  // Refresh when patients change elsewhere
  useEffect(() => {
    const handler = () => {
      const saved = localStorage.getItem("patients");
      if (saved) {
        try {
          setPatients(JSON.parse(saved));
        } catch {
          setPatients([]);
        }
      }
    };

    window.addEventListener("patientsUpdated", handler);
    return () => window.removeEventListener("patientsUpdated", handler);
  }, []);

  const addNewPatient = () => {
    onNewPatient();
  };

  // ✅ NEW: View button handler
  const handleView = (patient) => {
    if (!patient) return;
    // ✅ Pass the patient WITH the actual PDF filename stored in formPdf
    onOpenReport(patient);
  };

  // Comment text (Loan-dashboard style)
 const getComment = (status) => {
  switch (status) {
    case "Registered":
      return "New patient record has been created.";

    case "Lab Test Requested":
      return "Lab tests have been requested.";

    case "Report Uploaded":
      return "Medical report has been uploaded.";

    case "Treatment Completed":
      return "Treatment has been completed.";
    
case "Bill Generated":
  return "Final bill has been generated.";

case "Bill Paid":
  return "Final bill paid.";

    default:
      return "—";
  }
};
const getDashboardTitle = () => {
  switch (user?.role) {
    case "Admin":
      return "Admin Dashboard";
    case "Doctor":
      return "Doctor Dashboard";
    case "Lab":
      return "Lab Dashboard";
    default:
      return "Dashboard";
  }
};

// Hide billing-related details from Lab users
const isBillingStatus = (status) => {
  return status === "Bill Generated" || status === "Bill Paid";
};

const getDisplayStatusForRole = (status, role) => {
  const r = String(role || "").toLowerCase();
  if (r === "lab" && isBillingStatus(status)) {
    return "—"; // Lab users don't see billing statuses
  }
  // Doctors should not see the exact 'Bill Paid' status
  if (r === "doctor" && String(status || "").toLowerCase() === "bill paid") {
    return "—";
  }
  return status || "—";
};

// Role-aware patient list and column count
const filteredPatients = (() => {
  const r = String(user?.role || "").toLowerCase();

  // Lab users: show only entries that look like lab requests
  if (r === "lab") {
    return patients.filter(p => {
      const s = String(p?.status || "").toLowerCase();
      return s.includes("lab") && s.includes("request");
    });
  }

  // Doctor users: exclude patients whose status is exactly 'Bill Paid'
  if (r === "doctor") {
    return patients.filter(p => String(p?.status || "").toLowerCase() !== "bill paid");
  }

  return patients;
})();

const columnsCount = String(user?.role || "").toLowerCase() === "lab" ? 4 : 5;


  return (
    <div className="dashboard-container">

      {/* ===== TITLE BAR ===== */}
      {/* ===== TITLE BAR ===== */}
<div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16
  }}
>
  <h3>{getDashboardTitle()}</h3>
  {user?.role === "Admin" && (
    <button
      onClick={addNewPatient}
      style={{
        background: "#2563eb",
        color: "#fff",
        padding: "8px 16px",
        borderRadius: 8,
        border: "none",
        fontWeight: 600,
        cursor: "pointer"
      }}
    >
      New Patient +
    </button>
  )}
</div>


      {/* ===== TABLE BOX ===== */}
      <div className="dashboard-card">
        <div className="loan-box">
          <table className="loan-style-table">
            <thead>
              <tr>
                <th>Patient Name</th>
                <th>ID</th>
                <th>Status</th>
                <th>Action</th>
                {/* Hide comments column for Lab role */}
                {<th>Comments</th>}
              </tr>
            </thead>

            <tbody>
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={columnsCount} className="empty-row">
                    No patient records found.
                  </td>
                </tr>
              ) : (
                filteredPatients.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name || "Unnamed Patient"}</td>
                    <td>{p.patientId || p.id || "—"}</td>
                    <td className="status-text">{getDisplayStatusForRole(p.status, user?.role)}</td>
                    <td>
                      {/* ✅ FIXED VIEW BUTTON */}
                      <button
                        className="loan-view-btn"
                        onClick={() => handleView(p)}
                      >
                        View
                      </button>
                    </td>
                    <td className="comments-col">
                      {getComment(p.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
