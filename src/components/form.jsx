import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "@/styles/form.css";
import { postFormData, createPaymentOrder } from "../utils/formpost";
import { processPayment } from "../utils/payment";

import Continue from "@/components/continue";

import logo from "../assets/wordmark 1.svg";
import leftarrow from "../assets/left-arrow.svg";

const Form = () => {
  const [ticketData, setTicketData] = useState(null);
  const navigate = useNavigate();
  const { state } = useLocation();
  const { eventId, additionalDetails } = state || { eventId: null, additionalDetails: [] };

  const [formData, setFormData] = useState({
    name: "",
    organization: "",
    email: "",
    whatsappNumber: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleAdditionalChange = (key, value) => {
    setFormData((prevState) => ({
      ...prevState,
      additional_details: {
        ...prevState.additional_details,
        [key]: value,
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
  
    const payload = {
      full_name: formData.name,
      email: formData.email,
      phone: formData.whatsappNumber,
      additional_details: additionalDetails.length > 0 ? formData.additional_details : {},
    };
  
    try {
      const responseData = await postFormData(eventId, payload);
  
      if (responseData && responseData.ticket_id) {
        if (responseData.pay_amount > 0) {
          // Payment required
          const paymentData = await createPaymentOrder(eventId, responseData.event_registration_id);
  
          if (paymentData) {
            processPayment({
              paymentData,
              userDetails: {
                name: formData.name,
                email: formData.email,
                phone: formData.whatsappNumber,
              },
              onSuccess: () => navigate(`/tickets/${responseData.ticket_id}`),
              onFailure: () => alert("Payment failed, please try again."),
            });
          }
        } else {
          // No payment needed, proceed to ticket
          navigate(`/tickets/${responseData.ticket_id}`);
        }
      }
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };
  

  return (
    <div className="form-form-container">
      <div className="form-header">
        <div className="form-logo">
          <img src={logo} alt="Logo" className="form-logo-icon" />
        </div>
      </div>

      <div className="form-back-button">
        <button className="back-button" onClick={() => navigate(`/${eventId}`)}>
          <span className="form-arrow">
            <img src={leftarrow} alt="" />
          </span>{" "}
          <div className="not-on-mobile">Back</div>
        </button>
      </div>

      <div className="form-form-card">
        <h2 className="form-form-title">HOP ON AND FILL OUT THIS FORM!</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-form-group">
            <label htmlFor="name">Participant Name</label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder="Enter Your Name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          {/* <div className="form-form-group">
            <label htmlFor="organization">
              Participant Organization / Institution
            </label>
            <div className="form-select-wrapper">
              <select
                id="organization"
                name="organization"
                value={formData.organization}
                onChange={handleChange}
              >
                <option value="" disabled selected>
                  Choose organization/institution
                </option>
                <option value="org1">Organization 1</option>
                <option value="org2">Organization 2</option>
                <option value="org3">Organization 3</option>
              </select>
            </div>
          </div> */}

          <div className="form-form-group">
            <label htmlFor="email">Participant Email</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="Enter email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-form-group">
            <label htmlFor="whatsappNumber">Participant Number</label>
            <input
              type="text"
              id="whatsappNumber"
              name="whatsappNumber"
              placeholder="Enter Participant Whatsapp Number"
              value={formData.whatsappNumber}
              onChange={handleChange}
              required
            />
          </div>

          {additionalDetails.map((detail) => (
          <div key={detail.key}>
            <label>{detail.label}</label>
            {detail.field_type === "text" ? (
              <input type="text" name={detail.key} onChange={(e) => handleAdditionalChange(detail.key, e.target.value)} required={detail.required} />
            ) : detail.field_type === "select" ? (
              <select name={detail.key} onChange={(e) => handleAdditionalChange(detail.key, e.target.value)} required={detail.required}>
                <option value="">Select an option</option>
                {detail.options.map((option, index) => (
                  <option key={index} value={option}>{option}</option>
                ))}
              </select>
            ) : null}
          </div>
        ))}

          <button
            type="submit"
            className="form-continue-button"
          >
            CONTINUE
          </button>
        </form>
      </div>
      <Continue handleSubmit={handleSubmit} />
    </div>
  );
};

export default Form;
