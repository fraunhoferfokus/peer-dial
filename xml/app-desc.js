module.exports = `<?xml version="1.0" encoding="UTF-8"?>
<%
var ns = "";
for(var i in namespaces){
   ns = ns + ' xmlns:'+i+'="'+namespaces[i]+'"';
}
%>
<service xmlns="urn:dial-multiscreen-org:schemas:dial" <%-ns%> dialVer="1.7">
  <name><%=name%></name>
  <options allowStop="<%=allowStop%>"/>
  <state><%=state%></state>
  <% if(typeof rel != "undefined" && typeof href != "undefined" && href){ %>
  <link rel="<%=rel%>" href="<%=href%>" />
  <% } %>
  <% if(typeof additionalData != "undefined"){ %>
        <additionalData>
  <%    for(var i in additionalData){ %>
            <<%=i%>><%=additionalData[i]%></<%=i%>>
  <%    } %>
        </additionalData>
  <% }  %>
</service>
`;
