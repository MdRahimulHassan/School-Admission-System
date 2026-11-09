# syntax=docker/dockerfile:1

# ---- restore: cached until a .csproj changes --------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS restore
WORKDIR /src
COPY AdmissionSystem.sln ./
COPY src/Admission.Api/Admission.Api.csproj src/Admission.Api/
COPY tests/Admission.Api.Tests/Admission.Api.Tests.csproj tests/Admission.Api.Tests/
RUN dotnet restore AdmissionSystem.sln

# ---- build ------------------------------------------------------------------
FROM restore AS build
COPY . .
RUN dotnet build AdmissionSystem.sln -c Release --no-restore

# ---- test: used by docker-compose.test.yml, not part of the runtime image ----
FROM build AS test
ENTRYPOINT ["dotnet", "test", "AdmissionSystem.sln", "-c", "Release", "--no-build", "--logger", "console;verbosity=normal"]

# ---- publish ----------------------------------------------------------------
FROM build AS publish
RUN dotnet publish src/Admission.Api/Admission.Api.csproj -c Release --no-build -o /app/publish

# ---- runtime image ----------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=publish /app/publish .
EXPOSE 8080
# Run as the unprivileged user that ships with the image.
USER $APP_UID
ENTRYPOINT ["dotnet", "Admission.Api.dll"]
