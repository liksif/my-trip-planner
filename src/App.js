import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, doc, getDoc, setDoc, onSnapshot, query, orderBy,
  where, addDoc, updateDoc, deleteDoc
} from 'firebase/firestore';

// Global variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Firebase services
let app;
let db;
let auth;
let currentUserId;

function App() {
  const [plans, setPlans] = useState({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [planTitle, setPlanTitle] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);
  const [printStartDate, setPrintStartDate] = useState(null);
  const [printEndDate, setPrintEndDate] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // 1. Initialize Firebase and handle authentication
  useEffect(() => {
    try {
      app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      auth = getAuth(app);

      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          currentUserId = user.uid;
          console.log("Firebase user ID:", currentUserId);
        } else {
          try {
            // Sign in anonymously if no custom token or initial sign-in fails
            if (initialAuthToken) {
              await signInWithCustomToken(auth, initialAuthToken);
            } else {
              await signInAnonymously(auth);
            }
            currentUserId = auth.currentUser?.uid || crypto.randomUUID(); // Fallback if still no UID
            console.log("Signed in anonymously or with custom token. User ID:", currentUserId);
          } catch (error) {
            console.error("Firebase authentication error:", error);
            setErrorMessage(`Authentication failed: ${error.message}. Please refresh.`);
          }
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setErrorMessage(`Firebase initialization failed: ${error.message}. Check config.`);
    }
  }, []);

  // 2. Fetch data from Firestore once authenticated
  useEffect(() => {
    if (!isAuthReady || !db || !currentUserId) {
      return;
    }

    // Define the collection path for public data
    // Data will be stored under /artifacts/{appId}/public/data/tripPlans
    const plansCollectionRef = collection(db, `artifacts/${appId}/public/data/tripPlans`);

    // Listen for real-time updates to the plans
    const q = query(plansCollectionRef); // No orderBy to avoid index issues

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPlans = {};
      snapshot.forEach((doc) => {
        fetchedPlans[doc.id] = doc.data();
      });
      setPlans(fetchedPlans);
      setErrorMessage(''); // Clear any previous error messages
    }, (error) => {
      console.error("Error fetching plans from Firestore:", error);
      setErrorMessage(`Failed to load plans: ${error.message}.`);
    });

    return () => unsubscribe(); // Cleanup listener on component unmount
  }, [isAuthReady, db]);

  // Helper function to format date as YYYY-MM-DD for Firestore document IDs
  const formatDateId = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Function to handle date click
  const handleDateClick = (day) => {
    setSelectedDate(day);
    const dateId = formatDateId(day);
    const plan = plans[dateId];
    setPlanTitle(plan?.title || '');
    setPlanDescription(plan?.description || '');
    setShowModal(true);
  };

  // Function to save or update a plan
  const savePlan = async () => {
    if (!selectedDate || !db || !currentUserId) {
      setErrorMessage("Cannot save plan: Date not selected or Firebase not ready.");
      return;
    }

    const dateId = formatDateId(selectedDate);
    const planRef = doc(db, `artifacts/${appId}/public/data/tripPlans`, dateId);

    try {
      await setDoc(planRef, {
        title: planTitle,
        description: planDescription,
        lastUpdatedBy: currentUserId,
        timestamp: new Date(),
      }, { merge: true }); // Use merge to only update specified fields
      setShowModal(false);
      setErrorMessage('');
    } catch (error) {
      console.error("Error saving plan:", error);
      setErrorMessage(`Failed to save plan: ${error.message}`);
    }
  };

  // Function to delete a plan
  const deletePlan = async () => {
    if (!selectedDate || !db || !currentUserId) {
      setErrorMessage("Cannot delete plan: Date not selected or Firebase not ready.");
      return;
    }

    const dateId = formatDateId(selectedDate);
    const planRef = doc(db, `artifacts/${appId}/public/data/tripPlans`, dateId);

    try {
      await deleteDoc(planRef);
      setShowModal(false);
      setErrorMessage('');
    } catch (error) {
      console.error("Error deleting plan:", error);
      setErrorMessage(`Failed to delete plan: ${error.message}`);
    }
  };

  // Calendar rendering logic
  const renderCalendar = () => {
    const startDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const numDays = endDay.getDate();

    const calendarDays = [];
    const firstDayOfWeek = startDay.getDay(); // 0 for Sunday, 6 for Saturday

    // Add empty cells for days before the 1st of the month
    for (let i = 0; i < firstDayOfWeek; i++) {
      calendarDays.push(<div key={`empty-${i}`} className="w-1/7 aspect-square p-2 border-r border-b border-gray-200"></div>);
    }

    // Add actual days
    for (let i = 1; i <= numDays; i++) {
      const day = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
      const dateId = formatDateId(day);
      const plan = plans[dateId];
      const hasPlan = !!plan?.title || !!plan?.description;

      calendarDays.push(
        <div
          key={dateId}
          className={`w-1/7 aspect-square p-2 border-r border-b border-gray-200 cursor-pointer relative
                      ${hasPlan ? 'bg-blue-100' : 'bg-white'}
                      hover:bg-blue-200 transition-colors duration-200
                      ${selectedDate && formatDateId(selectedDate) === dateId ? 'border-2 border-blue-500 ring-2 ring-blue-300' : ''}`}
          onClick={() => handleDateClick(day)}
        >
          <span className="font-bold text-gray-800 text-lg">{i}</span>
          {hasPlan && (
            <div className="absolute bottom-1 left-1 right-1 text-xs text-blue-800 truncate">
              {plan.title || 'Plan exists'}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-7 gap-px bg-gray-200 border-t border-l border-gray-200 rounded-lg overflow-hidden">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="w-full text-center py-2 bg-gray-100 text-gray-600 font-semibold text-sm border-b border-r border-gray-200">
            {day}
          </div>
        ))}
        {calendarDays}
      </div>
    );
  };

  const handlePrintView = () => {
    setShowPrintView(true);
    setPrintStartDate(null); // Reset for new selection
    setPrintEndDate(null);   // Reset for new selection
  };

  const generatePrintContent = () => {
    if (!printStartDate || !printEndDate) {
      setErrorMessage("Please select a start and end date for printing.");
      return;
    }

    const start = new Date(printStartDate);
    const end = new Date(printEndDate);
    const printablePlans = [];

    let currentDate = new Date(start);
    while (currentDate <= end) {
      const dateId = formatDateId(currentDate);
      const plan = plans[dateId];
      if (plan && (plan.title || plan.description)) {
        printablePlans.push({ date: new Date(currentDate), plan: plan });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort by date to ensure correct order
    printablePlans.sort((a, b) => a.date - b.date);

    return (
      <div className="p-4 bg-white rounded-lg shadow-md max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
          Trip Itinerary: {formatDateId(start)} to {formatDateId(end)}
        </h2>
        {printablePlans.length === 0 ? (
          <p className="text-center text-gray-600">No plans found for the selected date range.</p>
        ) : (
          printablePlans.map((item, index) => (
            <div key={index} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-sm">
              <h3 className="text-xl font-semibold text-blue-700 mb-2">{item.date.toDateString()}</h3>
              <p className="text-gray-900 font-medium text-lg mb-1">{item.plan.title}</p>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{item.plan.description}</p>
              <p className="text-sm text-gray-500 mt-2">Last updated by: {item.plan.lastUpdatedBy}</p>
            </div>
          ))
        )}
        <div className="flex justify-center mt-6 print:hidden">
          <button
            onClick={() => window.print()}
            className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors duration-200"
          >
            Print
          </button>
          <button
            onClick={() => setShowPrintView(false)}
            className="ml-4 px-6 py-3 bg-gray-500 text-white font-semibold rounded-lg shadow-md hover:bg-gray-600 transition-colors duration-200"
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  // Helper for date input formatting
  const formatDateForInput = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 font-inter text-gray-800">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        @media print {
            body > div:not(.print-content) { display: none; }
            .print-content { display: block; width: 100%; margin: 0; padding: 0; }
        }
        /* Keyframes for the modal animation */
        @keyframes fade-in-scale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in-scale {
          animation: fade-in-scale 0.3s ease-out forwards;
        }
      `}</style>

      {errorMessage && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline ml-2">{errorMessage}</span>
          <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setErrorMessage('')}>
            <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.196l-2.651 3.653a1.2 1.2 0 1 1-1.697-1.697L8.303 9.5l-3.651-2.651a1.2 1.2 0 1 1 1.697-1.697L10 7.803l2.651-3.653a1.2 1.2 0 0 1 1.697 1.697L11.697 9.5l3.651 2.651a1.2 1.2 0 0 1 0 1.697z"/></svg>
          </span>
        </div>
      )}

      {!isAuthReady && (
        <div className="flex items-center justify-center h-screen">
          <div className="bg-white p-6 rounded-lg shadow-xl flex items-center">
            <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-lg text-gray-700">Loading trip planner...</p>
          </div>
        </div>
      )}

      {isAuthReady && (
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-2xl p-6 lg:p-10 border border-blue-200">
          <h1 className="text-4xl font-extrabold text-center text-blue-800 mb-8 tracking-tight">
            Collaborative Trip Planner
          </h1>

          <div className="flex justify-center mb-6 text-xl font-semibold text-gray-700">
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
              className="px-4 py-2 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors duration-200 mr-2"
            >
              &lt;
            </button>
            <span>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
              className="px-4 py-2 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors duration-200 ml-2"
            >
              &gt;
            </button>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between mb-8">
            <p className="text-gray-600 text-sm mb-2 md:mb-0">
              Your User ID: <span className="font-mono bg-gray-100 px-2 py-1 rounded text-gray-700 break-all">{currentUserId}</span>
              <br />Share this ID with others to identify your updates.
            </p>
            <button
              onClick={handlePrintView}
              className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-lg hover:bg-purple-700 transition-colors duration-200 transform hover:scale-105"
            >
              Create Printable Plan
            </button>
          </div>

          {renderCalendar()}

          {/* Plan Input Modal */}
          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg relative transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale">
                <h2 className="text-2xl font-bold text-blue-700 mb-4">
                  Plan for {selectedDate?.toDateString()}
                </h2>
                <div className="mb-4">
                  <label htmlFor="planTitle" className="block text-gray-700 text-sm font-bold mb-2">
                    Title:
                  </label>
                  <input
                    type="text"
                    id="planTitle"
                    className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    placeholder="e.g., Explore City Center"
                  />
                </div>
                <div className="mb-6">
                  <label htmlFor="planDescription" className="block text-gray-700 text-sm font-bold mb-2">
                    Description:
                  </label>
                  <textarea
                    id="planDescription"
                    className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-300 h-32 resize-y"
                    value={planDescription}
                    onChange={(e) => setPlanDescription(e.target.value)}
                    placeholder="Details: Visit museum, lunch at cafe, evening show..."
                  ></textarea>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={savePlan}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors duration-200 shadow-md"
                  >
                    Save Plan
                  </button>
                  {plans[formatDateId(selectedDate)] && (
                    <button
                      onClick={deletePlan}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 transition-colors duration-200 shadow-md"
                    >
                      Delete Plan
                    </button>
                  )}
                  <button
                    onClick={() => setShowModal(false)}
                    className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors duration-200 shadow-md"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Print View Modal */}
          {showPrintView && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl relative transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale">
                <h2 className="text-2xl font-bold text-blue-700 mb-4">Select Date Range for Printing</h2>
                <div className="mb-4">
                  <label htmlFor="printStartDate" className="block text-gray-700 text-sm font-bold mb-2">
                    Start Date:
                  </label>
                  <input
                    type="date"
                    id="printStartDate"
                    className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={formatDateForInput(printStartDate)}
                    onChange={(e) => setPrintStartDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)} // Add T00:00:00 to avoid timezone issues
                  />
                </div>
                <div className="mb-6">
                  <label htmlFor="printEndDate" className="block text-gray-700 text-sm font-bold mb-2">
                    End Date:
                  </label>
                  <input
                    type="date"
                    id="printEndDate"
                    className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={formatDateForInput(printEndDate)}
                    onChange={(e) => setPrintEndDate(e.target.value ? new Date(e.target.value + 'T23:59:59') : null)} // Add T23:59:59
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      if (printStartDate && printEndDate) {
                        const content = generatePrintContent();
                        if (content) {
                          const printWindow = window.open('', '_blank');
                          printWindow.document.write('<!DOCTYPE html><html><head><title>Trip Plan Print</title>');
                          printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">');
                          printWindow.document.write('<style>');
                          printWindow.document.write(`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`);
                          printWindow.document.write(`body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; }`);
                          printWindow.document.write(`@media print { .print\\:hidden { display: none !important; } }`);
                          printWindow.document.write('</style></head><body class="print-content">');
                          // Injecting React component content as plain HTML string
                          const tempDiv = document.createElement('div');
                          tempDiv.appendChild(content); // Append the React element to a temporary div to get its innerHTML
                          printWindow.document.write(tempDiv.innerHTML);
                          printWindow.document.write('</body></html>');
                          printWindow.document.close();
                          printWindow.focus();
                        }
                      } else {
                        setErrorMessage("Please select both start and end dates.");
                      }
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-300 transition-colors duration-200 shadow-md"
                  >
                    Show Printable View
                  </button>
                  <button
                    onClick={() => setShowPrintView(false)}
                    className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors duration-200 shadow-md"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
