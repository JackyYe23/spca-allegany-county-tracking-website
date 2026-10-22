import React from "react";
import "./AddDataButton.css";

function AddDataButton({ onClick, label = "+ Create Entry" }) {
  return (
    <button className="add-data-button" onClick={onClick} type="button">
      {label}
    </button>
  );
}

export default AddDataButton;
