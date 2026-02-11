// Google Apps Script Code
// Copy and paste this into your Google Form's Script Editor

// CONFIGURATION
// Replace with your actual backend URL (e.g., Render URL)
var WEBHOOK_URL = "https://your-api-url.onrender.com/applications/webhook";
var SECRET = "secret-token-from-google-script"; 

function onFormSubmit(e) {
  try {
    var response = e.response;
    var itemResponses = response.getItemResponses();
    
    // Construct payload
    // Adjust field titles to match your Google Form exactly
    var payload = {
      eventId: "default-event-id", // You might want to pass this or have it in the form
      applicantName: "",
      applicantEmail: "",
      businessName: "",
      googleFormData: {}
    };

    // Extract data
    // Assuming Form has fields: "Full Name", "Email", "Business Name", "Event ID"
    for (var i = 0; i < itemResponses.length; i++) {
      var itemResponse = itemResponses[i];
      var title = itemResponse.getItem().getTitle();
      var answer = itemResponse.getResponse();
      
      payload.googleFormData[title] = answer;

      if (title === "Full Name") payload.applicantName = answer;
      if (title === "Email") payload.applicantEmail = answer;
      if (title === "Business Name") payload.businessName = answer;
      if (title === "Event ID") payload.eventId = answer;
    }
    
    // Fallback email from collector if not in form fields
    if (!payload.applicantEmail && e.response.getRespondentEmail()) {
      payload.applicantEmail = e.response.getRespondentEmail();
    }

    // Send to Backend
    var options = {
      "method": "post",
      "contentType": "application/json",
      "headers": {
        "x-webhook-secret": SECRET
      },
      "payload": JSON.stringify(payload)
    };

    var result = UrlFetchApp.fetch(WEBHOOK_URL, options);
    Logger.log(result.getContentText());
    
  } catch (error) {
    Logger.log("Error sending webhook: " + error.toString());
    // Optional: Send email to admin on failure
    // MailApp.sendEmail("admin@makanx.com", "Webhook Failed", error.toString());
  }
}

function testSubmit() {
  // Mock event object for testing in editor
  var e = {
    response: {
      getItemResponses: function() {
        return [
          { getItem: function() { return { getTitle: function() { return "Full Name"; } }; }, getResponse: function() { return "Test Vendor"; } },
          { getItem: function() { return { getTitle: function() { return "Email"; } }; }, getResponse: function() { return "vendor@test.com"; } },
          { getItem: function() { return { getTitle: function() { return "Business Name"; } }; }, getResponse: function() { return "Test Satay"; } },
          { getItem: function() { return { getTitle: function() { return "Event ID"; } }; }, getResponse: function() { return "your-event-uuid"; } }
        ];
      },
      getRespondentEmail: function() { return "vendor@test.com"; }
    }
  };
  onFormSubmit(e);
}
