from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./tlah.db"
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = True
    beta_access_code: str = ""

    model_config = {"env_prefix": "TLAH_", "env_file": ".env"}


settings = Settings()
