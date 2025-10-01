import React from "react";

function App() {
  return (
    <div className="p-4 flex flex-col items-center justify-start bg-gray-100 h-full">
      <h1 className="text-xl font-bold mb-4">My Extension</h1>
      <p className="text-gray-700 mb-6 text-center">
        This popup is 400x600px and styled with Tailwind CSS.
      </p>
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        onClick={() => alert("Hello!")}
      >
        Click Me
      </button>
    </div>
  );
}

export default App;
